export const newestFirst = <T extends { createdAt: string }>(rows: T[]): T[] => [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
