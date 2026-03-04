"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = __importDefault(require("./index"));
async function seed() {
    console.log('Seeding test data...');
    // Create test projects
    await index_1.default.query(`
    INSERT INTO projects (name, code, type, location, address, price_min, price_max)
    VALUES 
      ('Emerald Villas', 'EMV-001', 'villa', 'Devanahalli', 'Devanahalli, Bangalore North', 15000000, 40000000),
      ('Tech Park Plots', 'TPP-001', 'plot', 'Electronic City', 'Electronic City Phase 2', 4000000, 8000000),
      ('Green Valley Plots', 'GVP-001', 'plot', 'Sarjapur', 'Sarjapur Road', 6000000, 12000000)
    ON CONFLICT (code) DO NOTHING
  `);
    // Create test agents
    await index_1.default.query(`
    INSERT INTO agents (name, phone, email, role, active)
    VALUES 
      ('Ravi Kumar', '+91-98765-43210', 'ravi@propagent.com', 'senior_agent', true),
      ('Priya Sharma', '+91-98765-43211', 'priya@propagent.com', 'agent', true),
      ('Suresh Patel', '+91-98765-43212', 'suresh@propagent.com', 'team_lead', true)
    ON CONFLICT (phone) DO NOTHING
  `);
    // Create test lead
    await index_1.default.query(`
    INSERT INTO leads (name, phone, email, source, status, intent_score, intent_class)
    VALUES 
      ('Ramesh Kumar', '+91-99887-76543', 'ramesh@email.com', 'meta_facebook', 'new', 0, 'cold')
    ON CONFLICT (phone) DO NOTHING
  `);
    console.log('✅ Seed complete');
}
seed().catch(console.error);
//# sourceMappingURL=seed.js.map