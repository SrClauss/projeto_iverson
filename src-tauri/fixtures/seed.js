/**
 * MongoDB seed script for D&D 5e SRD spells and monsters.
 *
 * Usage (mongosh):
 *   mongosh <connection-uri>/<db-name> seed.js
 *
 * Or from the shell:
 *   mongosh "mongodb://localhost:27017/iverson" seed.js
 */

const spells = require('./spells.json');
const monsters = require('./monsters.json');

// ── Spells ────────────────────────────────────────────────────
db.spells.drop();
db.spells.insertMany(spells);
print('Inserted ' + db.spells.countDocuments() + ' spells.');

db.spells.createIndex({ index: 1 }, { unique: true });
db.spells.createIndex({ name: 1 });
db.spells.createIndex({ level: 1 });
db.spells.createIndex({ 'school.index': 1 });
print('Spell indexes created.');

// ── Monsters ─────────────────────────────────────────────────
db.monsters.drop();
db.monsters.insertMany(monsters);
print('Inserted ' + db.monsters.countDocuments() + ' monsters.');

db.monsters.createIndex({ index: 1 }, { unique: true });
db.monsters.createIndex({ name: 1 });
db.monsters.createIndex({ challenge_rating: 1 });
db.monsters.createIndex({ type: 1 });
print('Monster indexes created.');
