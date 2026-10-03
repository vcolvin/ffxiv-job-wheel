// FFXIV job roster, grouped the way the in-game Character > Jobs panel groups them.
const ROLES = {
  tank:   { label: 'Tank',                color: '#2f4f9e', accent: '#7ea0ff' },
  healer: { label: 'Healer',              color: '#2f6b33', accent: '#8fd88a' },
  melee:  { label: 'Melee DPS',           color: '#7a2a2a', accent: '#ff8f7a' },
  ranged: { label: 'Physical Ranged DPS', color: '#6e2f3c', accent: '#ff9fb0' },
  caster: { label: 'Magical Ranged DPS',  color: '#5e2a4a', accent: '#e59ad0' },
};

const JOBS = [
  { id: 'pld', name: 'Paladin',      role: 'tank' },
  { id: 'war', name: 'Warrior',      role: 'tank' },
  { id: 'drk', name: 'Dark Knight',  role: 'tank' },
  { id: 'gnb', name: 'Gunbreaker',   role: 'tank' },
  { id: 'whm', name: 'White Mage',   role: 'healer' },
  { id: 'sch', name: 'Scholar',      role: 'healer' },
  { id: 'ast', name: 'Astrologian',  role: 'healer' },
  { id: 'sge', name: 'Sage',         role: 'healer' },
  { id: 'mnk', name: 'Monk',         role: 'melee' },
  { id: 'drg', name: 'Dragoon',      role: 'melee' },
  { id: 'nin', name: 'Ninja',        role: 'melee' },
  { id: 'sam', name: 'Samurai',      role: 'melee' },
  { id: 'rpr', name: 'Reaper',       role: 'melee' },
  { id: 'vpr', name: 'Viper',        role: 'melee' },
  { id: 'bst', name: 'Beastmaster',  role: 'melee', limited: true },
  { id: 'brd', name: 'Bard',         role: 'ranged' },
  { id: 'mch', name: 'Machinist',    role: 'ranged' },
  { id: 'dnc', name: 'Dancer',       role: 'ranged' },
  { id: 'blm', name: 'Black Mage',   role: 'caster' },
  { id: 'smn', name: 'Summoner',     role: 'caster' },
  { id: 'rdm', name: 'Red Mage',     role: 'caster' },
  { id: 'pct', name: 'Pictomancer',  role: 'caster' },
  { id: 'blu', name: 'Blue Mage',    role: 'caster', limited: true },
];
