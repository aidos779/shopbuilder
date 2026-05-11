require('dotenv').config();
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://placeholder:placeholder@localhost:5432/placeholder';

const spec = require('../src/config/swagger');
const outPath = path.resolve(__dirname, '../openapi.yaml');
fs.writeFileSync(outPath, yaml.dump(spec, { lineWidth: 120, noRefs: true }));
console.log(`openapi.yaml exported to ${outPath}`);
