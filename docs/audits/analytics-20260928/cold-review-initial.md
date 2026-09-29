Historical review of the first capture set. The named current captures now show the fixes; see `cold-review-final.md` for the recheck.

Cold visual review: not ready for acceptance. I personally opened all 18 supplied desktop and phone frames.

Blockers:

- Mobile navigation cuts off **Measurement** as “Measurem” with no visible overflow cue or alternative navigation. This makes a required evidence screen hard to find. Smallest remedy: use a mobile nav pattern that exposes every destination clearly, such as wrap or an explicit More menu. [operator-390-top.png](operator-390-top.png)

- Mobile tables hide the fields needed to compare albums and audit classifications: Album’s Previous/Change/Latest activity, Measurement’s audience columns, and Correction history’s classification/action are visibly cut off. The frames do not show a scroll cue. Smallest remedy: use stacked mobile rows for the comparison tables, or an explicitly signposted horizontal table with the album/name column pinned. [operator-390-albums.png](operator-390-albums.png), [operator-390-measurement.png](operator-390-measurement.png), [operator-390-corrections.png](operator-390-corrections.png)

- The Photos surface visibly offers “Export all 4 rows,” which reads as exporting analytics data, not photographs. Photo cards have no clear labeled share or download action; the small square control is not self-explanatory. A photographer cannot confidently find/share/export a selected photo from the visible UI. Smallest remedy: label data export as such and add visible, named photo actions for selected cards. [operator-1440-photos.png](operator-1440-photos.png), [operator-390-photos.png](operator-390-photos.png)

- Acceptance evidence is missing for the Rising and Recently active photo states. The tabs are visible, but only Popular is rendered in the supplied captures, so their results and empty states cannot be judged. Add desktop and phone frames with each state selected.

What is visibly strong:

- Desktop hierarchy makes the selected dates, measure, current activity, comparison period, and partial-today status easy to locate.
- The traffic panel plainly separates audience, operator, test, and unclassified traffic, and it avoids claiming a verified people count.
- Measurement clearly states unresolved Cloudflare comparison, first diagnostic date, and that no matching rows do not prove nothing happened.
- Saved views correctly say they store filters rather than frozen figures.
- Every frame carries the required synthetic-data label.

Limits: these are labeled local synthetic viewport captures. They do not prove real traffic, distinct underlying photos, working navigation/actions, downloads/sharing, or the unshown Rising/Recently active states. The fixed capture label also obscures the bottom edge of every phone frame, so controls there cannot be judged.