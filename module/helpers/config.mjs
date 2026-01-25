export const RAVE = {};

/**
 * Character ability scores
 * @type {Object}
 */
RAVE.abilities = {
  str: 'RAVE.Ability.Str.long',
  dex: 'RAVE.Ability.Dex.long',
  wis: 'RAVE.Ability.Wis.long',
  wil: 'RAVE.Ability.Wil.long',
};

/**
 * Character ability score abbreviations
 * @type {Object}
 */
RAVE.abilityAbbreviations = {
  str: 'RAVE.Ability.Str.abbr',
  dex: 'RAVE.Ability.Dex.abbr',
  wis: 'RAVE.Ability.Wis.abbr',
  wil: 'RAVE.Ability.Wil.abbr',
};

/**
 * Item types
 * @type {Object}
 */
RAVE.itemTypes = {
  general: 'general',
  weapon: 'weapon',
  spell: 'spell',
  mystery: 'mystery',
  armor: 'armor',
};

/**
 * Valid item types for validation
 * @type {string[]}
 */
RAVE.validItemTypes = Object.values(RAVE.itemTypes);

/**
 * Damage modes for weapon attacks
 * @type {Object}
 */
RAVE.damageModes = {
  normal: 'normal',
  enhanced: 'enhanced',
  impaired: 'impaired',
};
