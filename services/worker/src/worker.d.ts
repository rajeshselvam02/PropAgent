/**
 * Main Worker Entry Point
 *
 * Starts all job processors and scheduler
 */
/**
 * Start all workers
 */
export declare function startWorkers(): Promise<void>;
/**
 * Scheduler - runs periodic jobs
 */
export declare function startScheduler(): Promise<void>;
/**
 * Graceful shutdown
 */
export declare function shutdown(signal: string): Promise<void>;
//# sourceMappingURL=worker.d.ts.map