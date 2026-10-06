/**
 * The places on the data quality page that other pages link to. One list, so a link elsewhere
 * cannot point at a place that is not there. The page renders one element for each id.
 */
export const DATA_ANCHORS = ['status', 'coverage', 'traffic', 'counting', 'arrivals', 'site-measures', 'journeys', 'delivery', 'corrections'] as const;
export type DataAnchor = (typeof DATA_ANCHORS)[number];

/** Where Home's "Needs attention" links can lead. */
export type HomeProblemTarget = Extract<DataAnchor, 'status' | 'coverage' | 'site-measures' | 'delivery'>;
