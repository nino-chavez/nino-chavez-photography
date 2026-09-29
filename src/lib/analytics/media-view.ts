export type MediaOutcome = 'rendered' | 'load_failed';

export interface MediaView {
	photoId: string;
	albumKey: string | undefined;
	viewId: string;
	openedAt: number;
	observedOutcome: MediaOutcome | null;
	emittedOutcome: boolean;
}

export interface MediaViewEvent {
	name: 'photo_rendered' | 'photo_load_failed';
	photoId: string;
	albumKey: string | undefined;
	viewId: string;
	loadDurationMs?: number;
	errorCode?: 'image_load_failed';
}

/** A modal's view exists only while it is genuinely open on one photo. */
export function reconcileMediaView(
	current: MediaView | null,
	open: boolean,
	photo: { id: string; albumKey?: string } | null,
	newId: () => string,
	now: () => number
): { view: MediaView | null; opened: boolean } {
	if (!open || !photo) return { view: null, opened: false };
	if (current?.photoId === photo.id) return { view: current, opened: false };
	return {
		view: {
			photoId: photo.id,
			albumKey: photo.albumKey,
			viewId: newId(),
			openedAt: now(),
			observedOutcome: null,
			emittedOutcome: false
		},
		opened: true
	};
}

/** Ignore image callbacks from a DOM node that belongs to an earlier view. */
export function captureMatchesMediaView(view: MediaView | null, photoId: string, viewId: string): boolean {
	return view?.photoId === photoId && view.viewId === viewId;
}

function emitIfVisible(view: MediaView, visible: boolean, now: () => number): { view: MediaView; event: MediaViewEvent | null } {
	if (!visible || !view.observedOutcome || view.emittedOutcome) return { view, event: null };
	const emitted = { ...view, emittedOutcome: true };
	if (view.observedOutcome === 'load_failed') {
		return { view: emitted, event: { name: 'photo_load_failed', photoId: view.photoId, albumKey: view.albumKey, viewId: view.viewId, errorCode: 'image_load_failed' } };
	}
	return {
		view: emitted,
		event: {
			name: 'photo_rendered', photoId: view.photoId, albumKey: view.albumKey, viewId: view.viewId,
			loadDurationMs: Math.max(0, Math.round(now() - view.openedAt))
		}
	};
}

/** Store a terminal media outcome while hidden, then report it only when visible. */
export function observeMediaOutcome(
	view: MediaView | null,
	capture: { photoId: string; viewId: string },
	outcome: MediaOutcome,
	visible: boolean,
	now: () => number
): { view: MediaView | null; event: MediaViewEvent | null } {
	if (!captureMatchesMediaView(view, capture.photoId, capture.viewId) || !view) return { view, event: null };
	const observed = view.observedOutcome ? view : { ...view, observedOutcome: outcome };
	return emitIfVisible(observed, visible, now);
}

/** Visibility restoration flushes a load/error that occurred while the page was hidden. */
export function flushMediaOutcome(view: MediaView | null, visible: boolean, now: () => number): { view: MediaView | null; event: MediaViewEvent | null } {
	if (!view) return { view: null, event: null };
	return emitIfVisible(view, visible, now);
}
