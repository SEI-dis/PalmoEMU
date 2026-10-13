//
//  FocusEngine.swift
//  ManicEmu
//
//  Created by Daiuno on 2026/7/9.
//  Copyright © 2026 Manic EMU. All rights reserved.
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import UIKit

/// Spatial focus engine: collect candidates and pick the next view for a D-pad heading.
///
/// Three layers:
/// 1. Page-level: every focusable descendant competes. Container views are
///    skipped; a hit inside a container then calls enter/leave APIs.
/// 2. `UICollectionView` isolates after enter. Item-to-item search uses each
///    cell's layout frame and IndexPath so an off-axis inner switch does not
///    cause the engine to skip that item.
/// 3. Cell interior is a mini-page: the cell is the search root, inner
///    focusable views compete with their own frames (never the cell layout
///    frame). Same lane-then-expand rules, clipped to the cell. Re-entering
///    an item restores the last inner focus.
///
/// Geometry: left/right stay in the same row when a same-row target exists
/// (page-level `.all` then fans out if the row is empty). Up/down pick the
/// nearest in-heading target so a closer overlay is not skipped.
enum FocusEngine {

    private static let lanePadRatio: CGFloat = 0.15
    private static let lanePadFloor: CGFloat = 8
    /// Y-overlap above this fraction of the smaller height means "same row".
    private static let sameRowOverlapRatio: CGFloat = 0.35
    private static let sameRowOverlapFloor: CGFloat = 4

    enum ExpandPolicy {
        /// Lane only. Left/right that must yield to a neighbor use this.
        case none
        /// Up/down may fan out across the search root; left/right stay in the row.
        case verticalOnly
        /// Left/right: same row first, then nearest in-heading (side panes).
        /// Up/down: nearest in-heading so a closer overlay is not skipped.
        case all
    }

    /// Which window rect represents a candidate while scoring.
    enum GeometryPolicy {
        /// The view's own frame. Cell-interior / mini-page search.
        case viewFrame
        /// Enclosing collection item layout frame so an off-axis switch still
        /// stands in for its row at page level.
        case collectionItemFrame
    }

    // MARK: - Candidate collection

    /// Depth-first collect of focusable views under `root`.
    /// - `excludingContainerSubtree`: when leaving a container, omit that whole tree.
    static func collectCandidates(in root: UIView, excludingContainerSubtree: UIView? = nil) -> [UIView] {
        var result: [UIView] = []
        collect(from: root, into: &result, excludingContainerSubtree: excludingContainerSubtree)
        return result
    }

    private static func collect(from view: UIView, into result: inout [UIView], excludingContainerSubtree: UIView?) {
        guard !view.isHidden, view.alpha > 0.01 else { return }

        if let excluded = excludingContainerSubtree, view === excluded || view.isDescendant(of: excluded) {
            return
        }

        if let container = view as? FocusContainer, view.isFocusable {
            if container.canEnterFocus {
                collectFlattenedInterior(from: view, into: &result)
            } else {
                // Empty collections can still host overlays (blank slate).
                for subview in view.subviews {
                    collect(from: subview, into: &result, excludingContainerSubtree: excludingContainerSubtree)
                }
            }
            return
        }

        if view.isFocusable {
            result.append(view)
            return
        }

        for subview in view.subviews {
            collect(from: subview, into: &result, excludingContainerSubtree: excludingContainerSubtree)
        }
    }

    /// Focusable descendants of `host` (not `host` itself). Walks into a
    /// focusable host so a cell and its switch can both participate.
    static func collectFocusableDescendants(in host: UIView) -> [UIView] {
        var result: [UIView] = []
        for subview in host.subviews {
            collect(from: subview, into: &result, excludingContainerSubtree: nil)
        }
        return result
    }

    private static func collectFlattenedInterior(from view: UIView, into result: inout [UIView]) {
        for subview in view.subviews {
            guard !subview.isHidden, subview.alpha > 0.01 else { continue }

            if let nested = subview as? FocusContainer, subview.isFocusable, nested.canEnterFocus {
                collectFlattenedInterior(from: subview, into: &result)
                continue
            }

            if subview.isFocusable {
                result.append(subview)
                continue
            }

            collectFlattenedInterior(from: subview, into: &result)
        }
    }

    /// Nearest enterable FocusContainer ancestor (or the view itself).
    static func focusContainer(for view: UIView) -> (UIView & FocusContainer)? {
        var current: UIView? = view
        while let candidate = current {
            if let _ = candidate as? FocusContainer, candidate.isFocusable {
                return candidate as? (UIView & FocusContainer)
            }
            current = candidate.superview
        }
        return nil
    }

    // MARK: - Initial focus

    /// First focus: on-screen candidate closest to the top-leading corner.
    static func initialCandidate(in root: UIView) -> UIView? {
        let visibleBounds = searchBounds(for: root)
        let candidates = visibleCandidates(from: collectCandidates(in: root), visibleBounds: visibleBounds)
        guard !candidates.isEmpty else { return nil }

        return candidates.min { lhs, rhs in
            preferTopLeft(frameInWindow(of: lhs), frameInWindow(of: rhs))
        }
    }

    private static func preferTopLeft(_ lhs: CGRect, _ rhs: CGRect) -> Bool {
        let lhsMetric = lhs.minY + lhs.minX
        let rhsMetric = rhs.minY + rhs.minX
        if abs(lhsMetric - rhsMetric) > 0.5 { return lhsMetric < rhsMetric }
        if abs(lhs.minY - rhs.minY) > 0.5 { return lhs.minY < rhs.minY }
        return lhs.minX < rhs.minX
    }

    // MARK: - Directional search

    /// Next focus from `origin` under `root`. Returns nil when nothing is in-heading (caller may scroll).
    /// `additionalRoots` are searched too (chrome that is not a descendant of `root`).
    static func nextCandidate(
        from origin: UIView,
        direction: FocusDirection,
        in root: UIView,
        originFrame: CGRect? = nil,
        excludingContainerSubtree: UIView? = nil,
        additionalRoots: [UIView] = []
    ) -> UIView? {
        let frame = originFrame ?? frameInWindow(of: origin)
        var collected = collectCandidates(in: root, excludingContainerSubtree: excludingContainerSubtree)
        for extra in additionalRoots {
            guard extra !== root, extra !== excludingContainerSubtree else { continue }
            if extra.isDescendant(of: root) { continue }
            if let excluded = excludingContainerSubtree, extra.isDescendant(of: excluded) { continue }
            collected.append(contentsOf: collectCandidates(in: extra, excludingContainerSubtree: excludingContainerSubtree))
        }
        var bounds = searchBounds(for: root) ?? searchBounds(for: origin)
        for extra in additionalRoots {
            if let extraBounds = searchBounds(for: extra) {
                bounds = bounds.map { $0.union(extraBounds) } ?? extraBounds
            }
        }
        let candidates = visibleCandidates(
            from: collected.filter {
                $0 !== origin && !$0.isDescendant(of: origin) && !origin.isDescendant(of: $0)
            },
            visibleBounds: bounds
        )
        return bestCandidate(
            from: frame,
            direction: direction,
            candidates: candidates,
            searchBounds: bounds,
            expandPolicy: .all,
            geometry: .collectionItemFrame
        )
    }

    /// Mini-page search inside `host` (a collection cell, header, or similar).
    /// `host` is the search root, not a candidate. Inner views use their own
    /// frames; up/down may fan out only within `host`.
    static func nextCandidate(
        from origin: UIView,
        direction: FocusDirection,
        insideHost host: UIView
    ) -> UIView? {
        let inners = collectFocusableDescendants(in: host)
        let group: [UIView]
        if origin !== host {
            group = inners.filter { $0 !== origin && !$0.isDescendant(of: origin) }
        } else {
            group = inners
        }
        guard !group.isEmpty else { return nil }
        return bestCandidate(
            from: frameInWindow(of: origin),
            direction: direction,
            candidates: group,
            searchBounds: frameInWindow(of: host),
            expandPolicy: .verticalOnly,
            geometry: .viewFrame
        )
    }

    /// Geometric pick among views.
    static func bestCandidate(
        from originFrame: CGRect,
        direction: FocusDirection,
        candidates: [UIView],
        searchBounds: CGRect? = nil,
        expandPolicy: ExpandPolicy = .verticalOnly,
        geometry: GeometryPolicy = .collectionItemFrame
    ) -> UIView? {
        guard !candidates.isEmpty else { return nil }
        let frames = candidates.map { scoringFrame(for: $0, direction: direction, geometry: geometry) }
        let bounds = searchBounds ?? boundsSpanned(by: originFrame, frames: frames)
        guard let index = bestFrameIndex(
            from: originFrame,
            direction: direction,
            frames: frames,
            searchBounds: bounds,
            expandPolicy: expandPolicy
        ) else {
            return nil
        }
        return candidates[index]
    }

    /// Top-leading view among already-collected candidates (own frames).
    static func topLeadingCandidate(among views: [UIView]) -> UIView? {
        views.min { lhs, rhs in
            preferTopLeft(frameInWindow(of: lhs), frameInWindow(of: rhs))
        }
    }

    /// Geometric pick among raw frames (content space or window space).
    ///
    /// Horizontal headings keep the row unless `.all` finds the row empty
    /// (then the nearest in-heading target, e.g. a side pane). Vertical
    /// headings with expand pick nearest on the main axis so a closer
    /// overlay wins over a farther in-lane cell.
    static func bestFrameIndex(
        from originFrame: CGRect,
        direction: FocusDirection,
        frames: [CGRect],
        searchBounds: CGRect,
        expandPolicy: ExpandPolicy = .verticalOnly
    ) -> Int? {
        func pick(expandCrossAxis: Bool) -> Int? {
            pickIndex(
                from: originFrame,
                direction: direction,
                frames: frames,
                bounds: searchBounds,
                expandCrossAxis: expandCrossAxis
            )
        }
        switch expandPolicy {
        case .none:
            return pick(expandCrossAxis: false)
        case .verticalOnly:
            return pick(expandCrossAxis: !direction.isHorizontal)
        case .all:
            if direction.isHorizontal, let lane = pick(expandCrossAxis: false) {
                return lane
            }
            return pick(expandCrossAxis: true)
        }
    }

    /// Heading half-plane used to query layout attributes.
    static func headingSearchRect(
        from origin: CGRect,
        direction: FocusDirection,
        bounds: CGRect,
        expandCrossAxis: Bool
    ) -> CGRect {
        searchRect(from: origin, direction: direction, bounds: bounds, expandCrossAxis: expandCrossAxis)
    }

    private static func pickIndex(
        from origin: CGRect,
        direction: FocusDirection,
        frames: [CGRect],
        bounds: CGRect,
        expandCrossAxis: Bool
    ) -> Int? {
        let beam = searchRect(from: origin, direction: direction, bounds: bounds, expandCrossAxis: expandCrossAxis)
        guard beam.width > 0.5, beam.height > 0.5 else { return nil }

        var bestIndex: Int?
        var bestScore: Score?

        for (index, target) in frames.enumerated() {
            guard let score = score(
                from: origin,
                to: target,
                direction: direction,
                beam: beam,
                requireLane: !expandCrossAxis
            ) else {
                continue
            }
            if bestScore == nil || score < bestScore! {
                bestIndex = index
                bestScore = score
            }
        }
        return bestIndex
    }

    /// Empty containers are not candidates; this is only a fallback if one slips through.
    private static func scoringFrame(
        for candidate: UIView,
        direction: FocusDirection,
        geometry: GeometryPolicy
    ) -> CGRect {
        if geometry == .collectionItemFrame,
           let itemFrame = collectionItemFrameInWindow(for: candidate) {
            return itemFrame
        }
        if geometry == .collectionItemFrame,
           let container = candidate as? (UIView & FocusContainer),
           container.isFocusable,
           let entryFrame = container.focusEntryFrame(from: direction) {
            return entryFrame
        }
        return frameInWindow(of: candidate)
    }

    /// Prefer the cell/supplementary layout frame so an off-axis inner switch
    /// still represents its item in page-level competition.
    static func collectionItemFrameInWindow(for view: UIView) -> CGRect? {
        guard let window = view.window else { return nil }
        var current: UIView? = view
        while let candidate = current {
            if let cell = candidate as? UICollectionViewCell,
               let collectionView = cell.superview as? UICollectionView,
               collectionView.isFocusable,
               let indexPath = collectionView.indexPath(for: cell),
               let attributes = collectionView.layoutAttributesForItem(at: indexPath) {
                return collectionView.convert(attributes.frame, to: window)
            }
            if let reusable = candidate as? UICollectionReusableView,
               reusable.superview is UICollectionView,
               let collectionView = reusable.superview as? UICollectionView,
               collectionView.isFocusable {
                for section in 0..<collectionView.numberOfSections {
                    for kind in [UICollectionView.elementKindSectionHeader, UICollectionView.elementKindSectionFooter] {
                        let indexPath = IndexPath(item: 0, section: section)
                        if collectionView.supplementaryView(forElementKind: kind, at: indexPath) === reusable,
                           let attributes = collectionView.layoutAttributesForSupplementaryElement(ofKind: kind, at: indexPath) {
                            return collectionView.convert(attributes.frame, to: window)
                        }
                    }
                }
            }
            if candidate is UICollectionView { break }
            current = candidate.superview
        }
        return nil
    }

    /// Any on-screen pixel is enough. Fully off-screen views are skipped.
    private static func visibleCandidates(from candidates: [UIView], visibleBounds: CGRect?) -> [UIView] {
        guard let bounds = visibleBounds else { return candidates }
        return candidates.filter { isVisibleInWindow(frameInWindow(of: $0), visibleBounds: bounds) }
    }

    private static func isVisibleInWindow(_ frame: CGRect, visibleBounds: CGRect) -> Bool {
        guard frame.width > 0, frame.height > 0 else { return false }
        let intersection = frame.intersection(visibleBounds)
        return !intersection.isNull && intersection.width > 0.5 && intersection.height > 0.5
    }

    // MARK: - Scoring

    /// Smaller is better. Nearest ahead on the heading, then less side gap.
    private struct Score: Comparable {
        let mainDistance: CGFloat
        let transverseGap: CGFloat
        let tieBreak: CGFloat

        static func < (lhs: Score, rhs: Score) -> Bool {
            if abs(lhs.mainDistance - rhs.mainDistance) > 0.5 {
                return lhs.mainDistance < rhs.mainDistance
            }
            if abs(lhs.transverseGap - rhs.transverseGap) > 0.5 {
                return lhs.transverseGap < rhs.transverseGap
            }
            return lhs.tieBreak < rhs.tieBreak
        }
    }

    private static func score(
        from origin: CGRect,
        to target: CGRect,
        direction: FocusDirection,
        beam: CGRect,
        requireLane: Bool
    ) -> Score? {
        guard isInHeading(target, of: origin, direction: direction) else { return nil }
        if requireLane {
            guard sharesLane(origin, target, direction: direction) else { return nil }
        }

        let hit = target.intersection(beam)
        guard !hit.isNull, hit.width > 0.5, hit.height > 0.5 else { return nil }

        return Score(
            mainDistance: mainAxisDistance(from: origin, to: target, direction: direction),
            transverseGap: crossAxisGap(from: origin, to: target, direction: direction),
            tieBreak: target.minY * 10000 + target.minX
        )
    }

    /// Center must sit further along the heading, and the target must actually
    /// start further on that axis. A full-width header that contains a cell
    /// has a further center but a smaller minX — it is not "to the right".
    static func isInHeading(_ target: CGRect, of origin: CGRect, direction: FocusDirection) -> Bool {
        switch direction {
        case .up:
            return target.midY < origin.midY - 0.5 && target.maxY < origin.maxY - 0.5
        case .down:
            return target.midY > origin.midY + 0.5 && target.minY > origin.minY + 0.5
        case .left:
            return target.midX < origin.midX - 0.5 && target.maxX < origin.maxX - 0.5
        case .right:
            return target.midX > origin.midX + 0.5 && target.minX > origin.minX + 0.5
        }
    }

    /// Lane pass: the two frames must overlap enough on the cross axis.
    /// A few pixels of contact from beam padding is not a shared row/column.
    ///
    /// A full-bleed view always contains a small origin on the cross axis
    /// (a 28pt nav icon vs a list row). That is not the same column; the
    /// expand pass should still see nearer centered overlays.
    static func sharesLane(_ origin: CGRect, _ target: CGRect, direction: FocusDirection) -> Bool {
        let overlap: CGFloat
        let smaller: CGFloat
        let larger: CGFloat
        if direction.isHorizontal {
            overlap = min(origin.maxY, target.maxY) - max(origin.minY, target.minY)
            smaller = min(origin.height, target.height)
            larger = max(origin.height, target.height)
        } else {
            overlap = min(origin.maxX, target.maxX) - max(origin.minX, target.minX)
            smaller = min(origin.width, target.width)
            larger = max(origin.width, target.width)
        }
        guard overlap > sameRowOverlapFloor, smaller > 0.5 else { return false }
        if larger > smaller * 2, overlap < larger * sameRowOverlapRatio {
            return false
        }
        return overlap >= smaller * sameRowOverlapRatio
    }

    /// Distance to the target's near edge along the heading. Symmetric for reverse.
    static func mainAxisDistance(from origin: CGRect, to target: CGRect, direction: FocusDirection) -> CGFloat {
        switch direction {
        case .right: return target.minX - origin.maxX
        case .left: return origin.minX - target.maxX
        case .down: return target.minY - origin.maxY
        case .up: return origin.minY - target.maxY
        }
    }

    /// Gap between the two intervals on the cross axis (0 when they overlap).
    private static func crossAxisGap(from origin: CGRect, to target: CGRect, direction: FocusDirection) -> CGFloat {
        if direction.isHorizontal {
            if target.maxY < origin.minY { return origin.minY - target.maxY }
            if target.minY > origin.maxY { return target.minY - origin.maxY }
            return 0
        }
        if target.maxX < origin.minX { return origin.minX - target.maxX }
        if target.minX > origin.maxX { return target.minX - origin.maxX }
        return 0
    }

    /// Beam along the heading. Narrow pass is the origin lane (with a little pad).
    /// Expanded pass uses the full search bounds on the cross axis.
    /// Main-axis start is the origin's near edge so overlapping views are included.
    private static func searchRect(
        from origin: CGRect,
        direction: FocusDirection,
        bounds: CGRect,
        expandCrossAxis: Bool
    ) -> CGRect {
        switch direction {
        case .right:
            let lane = horizontalLane(origin: origin, bounds: bounds, expand: expandCrossAxis)
            return CGRect(x: origin.minX, y: lane.origin, width: max(0, bounds.maxX - origin.minX), height: lane.size)
        case .left:
            let lane = horizontalLane(origin: origin, bounds: bounds, expand: expandCrossAxis)
            return CGRect(x: bounds.minX, y: lane.origin, width: max(0, origin.maxX - bounds.minX), height: lane.size)
        case .down:
            let lane = verticalLane(origin: origin, bounds: bounds, expand: expandCrossAxis)
            return CGRect(x: lane.origin, y: origin.minY, width: lane.size, height: max(0, bounds.maxY - origin.minY))
        case .up:
            let lane = verticalLane(origin: origin, bounds: bounds, expand: expandCrossAxis)
            return CGRect(x: lane.origin, y: bounds.minY, width: lane.size, height: max(0, origin.maxY - bounds.minY))
        }
    }

    private static func horizontalLane(origin: CGRect, bounds: CGRect, expand: Bool) -> (origin: CGFloat, size: CGFloat) {
        if expand { return (bounds.minY, bounds.height) }
        let pad = max(lanePadFloor, origin.height * lanePadRatio)
        let minY = max(bounds.minY, origin.minY - pad)
        let maxY = min(bounds.maxY, origin.maxY + pad)
        return (minY, max(0, maxY - minY))
    }

    private static func verticalLane(origin: CGRect, bounds: CGRect, expand: Bool) -> (origin: CGFloat, size: CGFloat) {
        if expand { return (bounds.minX, bounds.width) }
        let pad = max(lanePadFloor, origin.width * lanePadRatio)
        let minX = max(bounds.minX, origin.minX - pad)
        let maxX = min(bounds.maxX, origin.maxX + pad)
        return (minX, max(0, maxX - minX))
    }

    /// On-screen portion of `view` in window space. Sheets expand to the sheet, not the window.
    private static func searchBounds(for view: UIView) -> CGRect? {
        guard let window = view.window else { return nil }
        let rootFrame = view.convert(view.bounds, to: window)
        let intersection = rootFrame.intersection(window.bounds)
        if intersection.isNull || intersection.width < 0.5 || intersection.height < 0.5 {
            return window.bounds
        }
        return intersection
    }

    private static func boundsSpanned(by origin: CGRect, frames: [CGRect]) -> CGRect {
        frames.reduce(origin) { $0.union($1) }
    }

    // MARK: - Geometry helpers

    /// Window frame used for pathfinding. Ignores this view's own transform so a
    /// focus lift (scale + translate up) does not make same-row siblings look
    /// like they sit below. Ancestor transforms (carousel layout) are kept.
    static func frameInWindow(of view: UIView) -> CGRect {
        guard let window = view.window else { return view.frame }
        if view.focusEffect, view.transform != .identity, let superview = view.superview {
            let size = view.bounds.size
            let untransformed = CGRect(
                x: view.center.x - size.width / 2,
                y: view.center.y - size.height / 2,
                width: size.width,
                height: size.height
            )
            return superview.convert(untransformed, to: window)
        }
        return view.convert(view.bounds, to: window)
    }

    /// Scroll an ordinary UIScrollView ancestor so `view` is on-screen.
    /// Collection containers scroll themselves; paging parents must not move.
    static func ensureVisible(_ view: UIView) {
        var current = view.superview
        while let candidate = current {
            if candidate is UICollectionView {
                return
            }
            if let scrollView = candidate as? UIScrollView, !scrollView.isPagingEnabled {
                let frame = view.convert(view.bounds, to: scrollView)
                let visible = scrollView.bounds.inset(by: scrollView.adjustedContentInset)
                if !visible.contains(frame) {
                    scrollView.scrollRectToVisible(frame.insetBy(dx: -8, dy: -8), animated: true)
                }
            }
            current = candidate.superview
        }
    }
}
