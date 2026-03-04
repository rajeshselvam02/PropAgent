"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = __importDefault(require("pg"));
const { Pool } = pg_1.default;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:@localhost:5432/propagent_dev',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});
exports.default = {
    query: (text, params) => pool.query(text, params),
    getClient: async () => {
        const client = await pool.connect();
        return client;
    },
    pool,
};
//# sourceMappingURL=index.js.map