//
//  FocusSystem.swift
//  ManicEmu
//
//  Created by Daiuno on 2026/7/9.
//  Copyright © 2026 Manic EMU. All rights reserved.
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import UIKit

/// FocusKit 的门面：context 栈管理、事件入口、命令链分发、焦点状态维护。
///
/// 接入方式：
/// 1. 页面出现时创建并 push 一个 `FocusContext`，离开时 pop；
/// 2. 希望参与导航的视图设置 `isFocusable = true`（UICollectionView 亦然，自动获得进入层级能力）；
/// 3. 将键盘/手柄事件转换为 `FocusKey` 后，按下时调用 `keyDown(_:)`、抬起时调用 `keyUp(_:)`；
///    没有按压相位的输入源可直接调用 `send(_:)`（等价于一次短按）。
///
/// 按压语义：
/// - 方向键：按下立即导航一次；按住超过 `repeatInitialDelay` 后开始加速连发
///   （间隔从 `repeatStartInterval` 按 `repeatAcceleration` 衰减至 `repeatMinInterval`）。
/// - 非方向键：按住超过 `longPressDelay` 触发 `.longPress` 命令；
///   长按被消费后抬起不再触发短按，否则抬起时按短按（`.tap`）分发。
///
/// 默认行为：方向键空间寻径移动焦点；a 键点击模拟；b 键关闭当前页面。
/// 任意按键（含默认键）都可通过 `FocusCommand` 在视图/容器/页面/全局四个层级拦截或扩展。
final class FocusSystem {
    static let shared = FocusSystem()

    /// 总开关，为 false 时输入直接忽略
    var isEnabled = true {
        didSet {
            if !isEnabled {
                cancelAllPresses()
            }
        }
    }

    // MARK: - 长按/连发参数

    /// 非方向键判定为长按的按住时长（业界惯例 0.5s，与 UILongPressGestureRecognizer 默认一致）
    var longPressDelay: TimeInterval = 0.5
    /// 方向键按住后开始连发的初始延迟（系统键盘自动重复的初始延迟约 0.4s）
    var repeatInitialDelay: TimeInterval = 0.4
    /// 方向键连发的起始间隔
    var repeatStartInterval: TimeInterval = 0.3
    /// 方向键连发的最小间隔（加速上限）
    var repeatMinInterval: TimeInterval = 0.06
    /// 每次连发后间隔的衰减系数，构成先慢后快的加速曲线
    var repeatAcceleration: Double = 0.85

    /// 按住中的按键状态
    private final class HeldKeyState {
        var timer: Timer?
        /// 非方向键：长按命令已被消费，抬起时不再触发短按
        var longPressHandled = false
        /// 方向键：当前连发间隔
        var repeatInterval: TimeInterval = 0

        func invalidate() {
            timer?.invalidate()
            timer = nil
        }
    }

    private var heldKeys: [FocusKey: HeldKeyState] = [:]

    /// 全局命令（任何 context 在栈顶时都生效，优先级低于页面命令）
    private(set) var globalCommands: [FocusCommand] = []

    /// 默认操作的提示文案（用于 currentHints，可按本地化需要覆盖）
    var moveHintTitle = "移动"
    var confirmHintTitle = "确定"
    var cancelHintTitle = "返回"

    private(set) var contexts: [FocusContext] = []

    /// 当前接收事件的 context（栈顶）
    var currentContext: FocusContext? { contexts.last }

    /// 当前聚焦的视图（若焦点在容器内且 cell 未实例化，可能为 nil）
    private(set) weak var focusedView: UIView?
    /// 焦点当前所在的容器
    private weak var focusedContainer: (UIView & FocusContainer)?

    /// Last successful D-pad hop. Opposite direction from the landing view
    /// returns here so A→B then reverse lands on A, not a different neighbor.
    private struct FocusHop {
        weak var from: UIView?
        let direction: FocusDirection
    }
    private var lastHop: FocusHop?

    /// True when a hardware keyboard/gamepad is connected. No highlight until the first direction key.
    var hasExternalInput: Bool {
        ExternalGameControllerManager.shared.connectedControllers.count > 0
    }
    
    /// True while a text field/view is first responder. Keyboard then types; FocusKit stays idle.
    var isEditingText: Bool {
        Self.textInputIsFirstResponder
    }
    
    private static var textInputIsFirstResponder: Bool {
        guard let responder = UIResponder.firstResponder else { return false }
        if responder is UITextField || responder is UITextView {
            return true
        }
        var view = responder as? UIView
        while let current = view {
            if current is UITextField || current is UITextView || current is UISearchBar {
                return true
            }
            view = current.superview
        }
        return false
    }

    private var textEditingObservers: [Any] = []

    private init() {
        let center = NotificationCenter.default
        let beginEditing: (Notification) -> Void = { [weak self] _ in
            self?.handleTextEditingDidBegin()
        }
        textEditingObservers = [
            center.addObserver(forName: UITextField.textDidBeginEditingNotification, object: nil, queue: .main, using: beginEditing),
            center.addObserver(forName: UITextView.textDidBeginEditingNotification, object: nil, queue: .main, using: beginEditing)
        ]
        registerShortcutTipsCommands()
    }

    /// Long-press Command / Control / Select to show the cheatsheet. Only runs while FocusKit is enabled.
    private func registerShortcutTipsCommands() {
        let title = R.string.localizable.focusShortcutsTips()
        let mappings: [(FocusKey, FocusShortcutsTipsView.Source)] = [
            (.command, .keyboard),
            (.control, .keyboard),
            (.select, .controller)
        ]
        for (key, source) in mappings {
            addGlobalCommand(FocusCommand(key: key, pressType: .longPress, title: title) { [weak self] in
                guard let self else { return false }
                guard self.isEnabled, self.currentContext != nil else { return false }
                let extraKeys = self.heldKeys.keys.filter { $0 != key }
                if extraKeys.contains(where: { !FocusShortcutsTipsView.isTriggerKey($0) }) {
                    return false
                }
                FocusShortcutsTipsView.show(source: source, holding: key)
                return true
            })
        }
    }
    
    private func handleTextEditingDidBegin() {
        FocusKeyObserver.shared.handleTextEditingDidBegin()
        cancelAllPresses()
        userDidTouchScreen()
    }

    /// Resign the current text input. Restores the FocusKit highlight on the field.
    private func endTextEditing() {
        guard isEditingText else { return }
        UIResponder.firstResponder?.resignFirstResponder()
        currentContext?.rootView?.window?.endEditing(true)
        guard let context = currentContext else { return }
        guard focusedView == nil && focusedContainer == nil else { return }
        establishInitialFocus(in: context)
    }

    // MARK: - Context 栈

    /// 页面出现时调用。当前栈顶的焦点会被记忆并释放，新 context 建立初始焦点。
    func push(_ context: FocusContext) {
        guard !contexts.contains(where: { $0 === context }) else { return }
        rememberAndClearCurrentFocus()
        contexts.append(context)
        lastHop = nil
        activateTopContext()
    }

    /// 页面离开时调用。传入的 context 及其上方的所有 context 一并出栈。
    func pop(_ context: FocusContext) {
        guard let index = contexts.firstIndex(where: { $0 === context }) else { return }
        let popped = contexts[index...]
        contexts.removeSubrange(index...)
        if popped.contains(where: { containsCurrentFocus(in: $0) }) {
            clearCurrentFocus()
        }
        lastHop = nil
        activateTopContext()
    }

    /// 弹出栈顶 context
    func pop() {
        if let top = contexts.last {
            pop(top)
        }
    }

    /// 替换栈顶 context（覆盖层之间的切换）。
    func replaceTop(with context: FocusContext) {
        if let top = contexts.last, top !== context {
            rememberAndClearCurrentFocus()
            contexts.removeLast()
            lastHop = nil
        }
        if !contexts.contains(where: { $0 === context }) {
            contexts.append(context)
        }
        activateTopContext()
    }

    /// 替换栈底 context（Home Tab 等同级页面）。
    /// 三个 Tab 各持有自己的 FocusContext，不互相压栈；Sheet 等覆盖层仍叠在当前 Tab 之上。
    /// If the current focus already belongs to the incoming context (shared
    /// chrome such as a tab bar), keep it instead of re-establishing.
    func replaceRoot(with context: FocusContext) {
        if contexts.isEmpty {
            contexts.append(context)
            activateTopContext()
            return
        }
        if contexts[0] === context {
            return
        }
        if contexts.contains(where: { $0 === context }) {
            return
        }
        let replacingActive = contexts.count == 1
        let keepFocus = replacingActive && currentFocusedView.map { isView($0, inside: context) } == true
        if replacingActive && !keepFocus {
            rememberAndClearCurrentFocus()
        }
        contexts[0] = context
        if replacingActive && !keepFocus {
            activateTopContext()
        }
    }

    /// 清空整个栈
    func reset() {
        clearCurrentFocus()
        contexts.removeAll()
        lastHop = nil
    }

    // MARK: - 全局命令

    func addGlobalCommand(_ command: FocusCommand) {
        globalCommands.append(command)
    }

    func removeGlobalCommands(for key: FocusKey) {
        globalCommands.removeAll { $0.key == key }
    }

    // MARK: - 事件入口

    /// 按键按下。与 `keyUp(_:)` 配对调用。
    ///
    /// 方向键：立即导航一次，按住超过 `repeatInitialDelay` 后开始加速连发。
    /// 非方向键：按住超过 `longPressDelay` 触发 `.longPress` 命令；
    /// 否则等到 `keyUp(_:)` 时按短按分发。
    func keyDown(_ key: FocusKey) {
        guard isEnabled else { return }
        // Typing: leave arrows/confirm with the field. B/Esc only ends editing.
        if isEditingText {
            if key == .b {
                endTextEditing()
            }
            return
        }
        // Sources should pair down/up; ignore a repeated down.
        guard heldKeys[key] == nil else { return }

        let state = HeldKeyState()
        heldKeys[key] = state

        if key.direction != nil {
            // 方向键：按下立即响应，保证导航跟手
            send(key)
            state.repeatInterval = repeatStartInterval
            state.timer = makeTimer(after: repeatInitialDelay) { [weak self] in
                self?.repeatDirectionKey(key)
            }
        } else {
            state.timer = makeTimer(after: longPressDelay) { [weak self] in
                guard let self, let state = self.heldKeys[key] else { return }
                state.timer = nil
                if self.dispatchLongPress(key) {
                    // 长按已被消费：本次按压抬起时不再触发短按
                    state.longPressHandled = true
                }
            }
        }
    }

    /// Key released; pairs with `keyDown(_:)`.
    func keyUp(_ key: FocusKey) {
        guard let state = heldKeys.removeValue(forKey: key) else { return }
        state.invalidate()
        FocusShortcutsTipsView.handleKeyUp(key)
        guard isEnabled else { return }

        // Direction keys already navigated on down / repeat; up is cleanup only.
        if key.direction != nil { return }
        // Long-press already consumed this press; skip the tap.
        if state.longPressHandled { return }

        send(key)
    }

    /// One complete tap. Input sources without press phases can call this directly.
    func send(_ key: FocusKey) {
        guard isEnabled, let context = currentContext else { return }

        validateFocusState(in: context)

        let previousFocus = focusedView ?? (focusedContainer as UIView?)

        // Command chain: focused view → container → page → global; first consumer wins.
        if dispatchCommands(for: key, pressType: .tap, in: context) {
            playFocusSound(for: key, previousFocus: previousFocus)
            return
        }

        // Default behavior
        if let direction = key.direction {
            moveFocus(direction, in: context)
            playFocusSound(for: key, previousFocus: previousFocus)
        } else if key == .a {
            playFocusSound(for: key, previousFocus: previousFocus)
            performConfirm()
        } else if key == .b {
            playFocusSound(for: key, previousFocus: previousFocus)
            // Has focus: clear it (position remembered, D-pad can restore). Otherwise close the page.
            if focusedView != nil || focusedContainer != nil {
                rememberAndClearCurrentFocus()
            } else {
                context.performCancel()
            }
        }
        // Custom keys have no default behavior
    }

    /// Hover only when focus actually moved; confirm/cancel fire for A/B regardless of the handler.
    private func playFocusSound(for key: FocusKey, previousFocus: UIView?) {
        if key.direction != nil {
            let current = focusedView ?? (focusedContainer as UIView?)
            if current !== previousFocus {
                FocusSoundEffects.shared.play(.hover)
            }
        } else if key == .a {
            FocusSoundEffects.shared.play(.focus)
        } else if key == .b {
            FocusSoundEffects.shared.play(.cancel)
        }
    }

    // MARK: - 长按与连发

    private func dispatchLongPress(_ key: FocusKey) -> Bool {
        guard isEnabled, let context = currentContext else { return false }
        validateFocusState(in: context)
        return dispatchCommands(for: key, pressType: .longPress, in: context)
    }

    /// 方向键连发：间隔按 `repeatAcceleration` 逐次衰减，先慢后快
    private func repeatDirectionKey(_ key: FocusKey) {
        guard let state = heldKeys[key] else { return }
        send(key)
        state.repeatInterval = max(repeatMinInterval, state.repeatInterval * repeatAcceleration)
        state.timer = makeTimer(after: state.repeatInterval) { [weak self] in
            self?.repeatDirectionKey(key)
        }
    }

    /// 定时器加入 .common 模式，保证滚动（如容器滚动到可见）期间连发不中断
    private func makeTimer(after interval: TimeInterval, block: @escaping () -> Void) -> Timer {
        let timer = Timer(timeInterval: interval, repeats: false) { _ in block() }
        RunLoop.main.add(timer, forMode: .common)
        return timer
    }

    private func cancelAllPresses() {
        for state in heldKeys.values {
            state.invalidate()
        }
        heldKeys.removeAll()
        FocusShortcutsTipsView.hide()
    }

    // MARK: - 手动焦点控制

    /// 手动指定焦点（视图必须在当前 context 的 rootView 子树内才有意义）
    func focus(_ view: UIView) {
        guard let context = currentContext else { return }
        if let container = FocusEngine.focusContainer(for: view), view !== container {
            enterContainer(container, from: nil, preferred: view, context: context)
        } else if let container = view as? (UIView & FocusContainer), view.isFocusable {
            enterContainer(container, from: nil, preferred: nil, context: context)
        } else {
            setFocus(view, container: nil, context: context)
        }
        lastHop = nil
    }

    /// 焦点失效（如页面内容刷新）后重建焦点
    func updateFocusIfNeeded() {
        guard let context = currentContext else { return }
        validateFocusState(in: context)
        if focusedView == nil && focusedContainer == nil {
            establishInitialFocus(in: context)
        }
    }

    /// 当前焦点视图（容器内聚焦时为具体的 cell/子视图）
    var currentFocusedView: UIView? {
        focusedView ?? (focusedContainer as UIView?)
    }

    /// 用户触摸了屏幕：意图切换为触摸操作，移除当前焦点。
    /// 焦点位置已记忆，之后按方向键会从原位置恢复。
    func userDidTouchScreen() {
        resignFocusKeepingMemory()
    }

    /// 手柄/外接键盘全部断开：取消当前高亮，位置仍记忆，下次接入后再按方向键可恢复。
    func handleExternalInputDidChange() {
        guard !hasExternalInput else { return }
        resignFocusKeepingMemory()
    }

    /// 容器异步落焦（探测式滚动等场景）完成后，同步系统级焦点状态。
    /// 仅当该容器仍持有焦点时生效。`direction` 为触发本次导航的方向键方向。
    func containerDidUpdateFocus(_ container: UIView & FocusContainer, direction: FocusDirection? = nil) {
        guard focusedContainer === container, let context = currentContext else { return }
        let inner = container.currentFocusedDescendant
        focusedView = (inner === container) ? nil : inner
        context.lastFocusedView = inner ?? container
        notifyFocusChange(direction: direction)
    }

    // MARK: - 操作说明

    /// 当前上下文全部可用操作的描述，供操作提示条渲染。
    /// 顺序：焦点视图命令 → 容器命令 → 页面命令 → 全局命令 → 默认操作；
    /// 同键同按压类型去重（先注册者优先），短按与长按视为两个独立操作。
    var currentHints: [FocusHint] {
        guard let context = currentContext else { return [] }

        var hints: [FocusHint] = []
        var coveredTapKeys = Set<FocusKey>()
        var coveredLongPressKeys = Set<FocusKey>()

        for command in commandChain(in: context) {
            switch command.pressType {
            case .tap:
                guard coveredTapKeys.insert(command.key).inserted else { continue }
            case .longPress:
                guard coveredLongPressKeys.insert(command.key).inserted else { continue }
            }
            hints.append(FocusHint(keys: [command.key], title: command.title, pressType: command.pressType))
        }

        let directionKeys: [FocusKey] = [.up, .down, .left, .right]
        let uncoveredDirections = directionKeys.filter { !coveredTapKeys.contains($0) }
        if !uncoveredDirections.isEmpty {
            hints.append(FocusHint(keys: uncoveredDirections, title: moveHintTitle))
        }
        if !coveredTapKeys.contains(.a) {
            hints.append(FocusHint(keys: [.a], title: confirmHintTitle))
        }
        if !coveredTapKeys.contains(.b) {
            hints.append(FocusHint(keys: [.b], title: cancelHintTitle))
        }
        return hints
    }

    // MARK: - 命令分发

    private func commandChain(in context: FocusContext) -> [FocusCommand] {
        var chain: [FocusCommand] = []
        if let focusedView, focusedView !== focusedContainer {
            chain.append(contentsOf: focusedView.focusCommands)
        }
        if let focusedContainer {
            chain.append(contentsOf: focusedContainer.containerFocusCommands())
        }
        chain.append(contentsOf: context.commands)
        chain.append(contentsOf: globalCommands)
        return chain
    }

    private func dispatchCommands(for key: FocusKey, pressType: FocusPressType, in context: FocusContext) -> Bool {
        for command in commandChain(in: context) where command.key == key && command.pressType == pressType {
            if command.handler() {
                return true
            }
        }
        return false
    }

    // MARK: - 方向移动

    private func moveFocus(_ direction: FocusDirection, in context: FocusContext) {
        guard let root = context.rootView else { return }

        // No focus yet: establish one, still tagged with the D-pad heading.
        if focusedView == nil && focusedContainer == nil {
            establishInitialFocus(in: context, direction: direction)
            return
        }

        let originView = focusedView ?? (focusedContainer as UIView?)

        // Isolating containers own D-pad, including reverse within the container.
        // Page-level reverse hop must not skip remaining inner targets in a cell.
        var exitingContainer: (UIView & FocusContainer)?
        if let container = focusedContainer, container.isolatesFocusNavigation {
            switch container.navigateFocus(direction, current: focusedView) {
            case .handled(let view):
                updateFocusInsideContainer(container, view: view, direction: direction, context: context)
                rememberHop(from: originView, direction: direction)
                return
            case .exit:
                exitingContainer = container
            }
        }

        if tryReverseHop(direction, from: originView, in: context, exitingContainer: exitingContainer) {
            return
        }

        // Page-level search. Prefer the real focused cell/subview as origin so a
        // full-screen list can still yield to overlapping overlays (toolbars).
        let origin: UIView? = focusedView ?? (focusedContainer as UIView?)
        guard let origin else { return }
        // Degenerate container (paging with no inner focus): aim from the visible center.
        var originFrame: CGRect?
        if focusedView == nil, let container = focusedContainer {
            let frame = FocusEngine.frameInWindow(of: container)
            originFrame = CGRect(x: frame.midX, y: frame.midY, width: 1, height: 1)
        }
        guard let target = FocusEngine.nextCandidate(
            from: origin,
            direction: direction,
            in: root,
            originFrame: originFrame,
            excludingContainerSubtree: exitingContainer,
            additionalRoots: context.additionalSearchRoots(entering: direction)
        ) else {
            notifyNavigationBlocked(direction, in: context)
            return
        }

        applyNavigationTarget(target, direction: direction, context: context)
        rememberHop(from: originView, direction: direction)
    }

    /// Opposite of the last hop returns to that view when it is still valid.
    /// If an isolating container just exited, only reverse to a view outside it —
    /// going back to a different inner of that container is the container's job.
    private func tryReverseHop(
        _ direction: FocusDirection,
        from current: UIView?,
        in context: FocusContext,
        exitingContainer: (UIView & FocusContainer)? = nil
    ) -> Bool {
        guard direction == lastHop?.direction.opposite,
              let previous = lastHop?.from,
              previous.window != nil,
              previous !== current,
              isView(previous, inside: context)
        else {
            return false
        }
        if let exiting = exitingContainer,
           previous === exiting || previous.isDescendant(of: exiting) {
            return false
        }
        let stillFocusable = previous.fk_canFocus || FocusEngine.focusContainer(for: previous) != nil
        guard stillFocusable else { return false }

        applyNavigationTarget(previous, direction: direction, context: context)
        if currentFocusedView === current { return false }
        rememberHop(from: current, direction: direction)
        return true
    }

    private func rememberHop(from origin: UIView?, direction: FocusDirection) {
        lastHop = FocusHop(from: origin, direction: direction)
    }

    /// After a page-level hit: enter the container if the target lives inside one.
    private func applyNavigationTarget(_ target: UIView, direction: FocusDirection?, context: FocusContext) {
        if let container = FocusEngine.focusContainer(for: target), target !== container {
            enterContainer(container, from: direction, preferred: target, context: context, notifyDirection: direction)
        } else if let container = target as? (UIView & FocusContainer), target.isFocusable {
            enterContainer(container, from: direction, preferred: nil, context: context, notifyDirection: direction)
        } else {
            setFocus(target, container: nil, context: context, direction: direction)
        }
    }

    // MARK: - 确定键

    private func performConfirm() {
        if let container = focusedContainer {
            if container.performPrimaryActionOnFocused() { return }
        }
        if let focusedView, focusedView !== focusedContainer {
            focusedView.fk_performPrimaryAction()
        }
    }

    // MARK: - 焦点状态维护

    private func enterContainer(
        _ container: UIView & FocusContainer,
        from direction: FocusDirection?,
        preferred: UIView?,
        context: FocusContext,
        notifyDirection: FocusDirection? = nil
    ) {
        guard let inner = container.enterFocus(from: direction, preferred: preferred) else { return }
        releaseCurrentFocus(exceptContainer: container)
        focusedContainer = container
        focusedView = (inner === container) ? nil : inner
        rememberContentFocus(focusedView ?? container, in: context)
        notifyFocusChange(direction: notifyDirection ?? direction)
    }

    private func updateFocusInsideContainer(_ container: UIView & FocusContainer, view: UIView, direction: FocusDirection, context: FocusContext) {
        focusedContainer = container
        focusedView = (view === container) ? nil : view
        rememberContentFocus(focusedView ?? container, in: context)
        notifyFocusChange(direction: direction)
    }

    private func setFocus(_ view: UIView, container: (UIView & FocusContainer)?, context: FocusContext, direction: FocusDirection? = nil) {
        guard focusedView !== view else { return }
        releaseCurrentFocus(exceptContainer: container)
        focusedView = view
        focusedContainer = container
        rememberContentFocus(view, in: context)
        view.fk_applyFocus(true)
        FocusEngine.ensureVisible(view)
        notifyFocusChange(direction: direction)
    }

    /// Chrome in additional search roots keeps its own memory; page restore should return to content.
    private func rememberContentFocus(_ view: UIView, in context: FocusContext) {
        guard let root = context.rootView, view === root || view.isDescendant(of: root) else { return }
        context.lastFocusedView = view
    }

    private func notifyFocusChange(direction: FocusDirection? = nil) {
        currentContext?.onFocusChange?(currentFocusedView, direction)
    }

    /// 屏内无合法导航目标：焦点不动，通知业务方按方向滚动内容入屏
    private func notifyNavigationBlocked(_ direction: FocusDirection, in context: FocusContext) {
        context.onFocusChange?(nil, direction)
    }

    /// 释放当前焦点的视觉与状态（容器保留焦点记忆）
    private func releaseCurrentFocus(exceptContainer: (UIView & FocusContainer)? = nil) {
        if let focusedContainer, focusedContainer !== exceptContainer {
            focusedContainer.resignFocus()
        }
        if let focusedView, focusedView !== focusedContainer {
            focusedView.fk_applyFocus(false)
        }
        focusedView = nil
        focusedContainer = nil
    }

    private func clearCurrentFocus() {
        let hadFocus = focusedView != nil || focusedContainer != nil
        releaseCurrentFocus()
        lastHop = nil
        if hadFocus {
            notifyFocusChange()
        }
    }

    private func rememberAndClearCurrentFocus() {
        if let top = contexts.last {
            // 焦点在容器内时记忆容器本身：cell/子视图会随复用失效，
            // 容器自带内部位置记忆（lastFocusedIndexPath），恢复时重新进入即可
            top.lastFocusedView = (focusedContainer as UIView?) ?? focusedView
        }
        clearCurrentFocus()
    }

    /// 栈顶变化后恢复/建立焦点。延迟一个 runloop，等待页面布局完成。
    /// 未接入外设时不自动落焦，避免纯触摸打开 sheet 时第一项被高亮。
    private func activateTopContext() {
        guard let context = currentContext, context.autoFocusOnActivate else { return }
        guard hasExternalInput else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self, self.currentContext === context else { return }
            guard self.hasExternalInput else { return }
            guard self.focusedView == nil && self.focusedContainer == nil else { return }
            self.establishInitialFocus(in: context)
        }
    }

    private func resignFocusKeepingMemory() {
        guard focusedView != nil || focusedContainer != nil else { return }
        cancelAllPresses()
        rememberAndClearCurrentFocus()
    }

    private func establishInitialFocus(in context: FocusContext, direction: FocusDirection? = nil) {
        // 1. 焦点记忆
        if let remembered = context.lastFocusedView, remembered.window != nil, isView(remembered, inside: context) {
            if let container = remembered as? (UIView & FocusContainer), remembered.isFocusable {
                enterContainer(container, from: nil, preferred: nil, context: context, notifyDirection: direction)
                return
            }
            // 记忆的是容器内部的 cell/子视图：必须重新进入容器（容器自带位置记忆），
            // 直接 setFocus 会绕过容器导致后续导航脱离容器管理
            var ancestor = remembered.superview
            while let view = ancestor {
                if let container = view as? (UIView & FocusContainer), view.isFocusable {
                    enterContainer(container, from: nil, preferred: nil, context: context, notifyDirection: direction)
                    return
                }
                ancestor = view.superview
            }
            if remembered.fk_canFocus {
                setFocus(remembered, container: nil, context: context, direction: direction)
                return
            }
        }
        // 2. 指定的初始焦点
        if let preferred = context.preferredFocusView?(), preferred.window != nil {
            focus(preferred)
            return
        }
        // 3. 左上角最近的候选
        guard let root = context.rootView else { return }
        guard let initial = FocusEngine.initialCandidate(in: root) else { return }
        applyNavigationTarget(initial, direction: direction, context: context)
    }

    /// 焦点视图可能已被移出视图层级（reload、页面变化），失效则清理状态
    private func validateFocusState(in context: FocusContext) {
        if let container = focusedContainer {
            if container.window == nil || !isView(container, inside: context) {
                clearCurrentFocus()
            }
            return
        }
        if let view = focusedView {
            if view.window == nil || !isView(view, inside: context) || !view.fk_canFocus {
                clearCurrentFocus()
            }
        }
    }

    private func isView(_ view: UIView, inside context: FocusContext) -> Bool {
        context.contains(view)
    }

    private func containsCurrentFocus(in context: FocusContext) -> Bool {
        if let focusedContainer, isView(focusedContainer, inside: context) { return true }
        if let focusedView, isView(focusedView, inside: context) { return true }
        return false
    }
}
