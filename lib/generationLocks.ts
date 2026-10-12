declare global {var __generationLocks:Set<string>|undefined;}
export function generationLocks(){return globalThis.__generationLocks??=new Set();}
