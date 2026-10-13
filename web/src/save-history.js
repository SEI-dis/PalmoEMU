// SPDX-License-Identifier: AGPL-3.0-or-later
// Long-lived battery snapshots complement the five recent recovery generations.
// Interval/retention follows mGBA Celio Web; this storage implementation is original.
export const archiveInterval=5*60*1000,archiveLimit=10;
export function retainArchive(history,save){
 const previous=history[0];
 if(previous&&(save.at<previous.at+archiveInterval||previous.hash&&previous.hash===save.hash))return history;
 return [save,...history].slice(0,archiveLimit);
}
