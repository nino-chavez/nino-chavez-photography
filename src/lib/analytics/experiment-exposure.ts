export type ExperimentAssignment = { key?: string; variant?: string; release?: string };

export type ExperimentExposureEvent = {
	eventName: 'experiment_exposed';
	properties: { experiment_key: string; variant: string; surface: string; release: string };
};

export function experimentExposureIdentity(assignment: ExperimentAssignment | null | undefined, surface: string): string | null {
	if (!assignment?.key || !assignment.variant || !assignment.release || !surface) return null;
	return `${assignment.key}:${assignment.variant}:${assignment.release}:${surface}`;
}

/** Keeps a SPA revisit from double-counting a surface that has already been observed. */
export function createExperimentExposureEmitter(
	track: (event: ExperimentExposureEvent) => void
): (assignment: ExperimentAssignment | null | undefined, surface: string) => void {
	const emitted = new Set<string>();
	return (assignment, surface) => {
		const identity = experimentExposureIdentity(assignment, surface);
		if (!identity || emitted.has(identity)) return;
		emitted.add(identity);
		track({ eventName: 'experiment_exposed', properties: {
			experiment_key: assignment!.key!, variant: assignment!.variant!, surface, release: assignment!.release!
		} });
	};
}
