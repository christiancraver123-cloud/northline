// Experiment artifacts (e.g. the Sienna identity probe) live in private storage under experiments/<id>/. These helpers only ever build
// paths from whitelisted names, so a request can never reach outside that folder.
export const safeExperimentPath = (id: string, file: string): string | null =>
  /^[a-z0-9][a-z0-9-]{0,60}$/.test(id) && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,120}\.(png|json)$/.test(file) && !file.includes("..") ? `experiments/${id}/${file}` : null;
export const experimentMime = (file: string) => (file.endsWith(".json") ? "application/json" : "image/png");
