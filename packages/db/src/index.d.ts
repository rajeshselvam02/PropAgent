import pkg from 'pg';
declare const _default: {
    query: (text: string, params?: any[]) => Promise<pkg.QueryResult<any>>;
    getClient: () => Promise<pkg.PoolClient>;
    pool: pkg.Pool;
};
export default _default;
//# sourceMappingURL=index.d.ts.map