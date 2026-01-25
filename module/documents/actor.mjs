/**
 * Extend the base Actor document
 * @extends {Actor}
 */
export class raveActor extends Actor {

  /**
   * Augment the basic actor data with additional dynamic data
   */
  prepareData() {
    super.prepareData();
  }

  /**
   * Prepare base data for the actor
   */
  prepareBaseData() {}

  /**
   * Prepare derived data for the actor
   */
  prepareDerivedData() {
    const actorData = this;
    this._prepareCharacterData(actorData);
    this._prepareNpcData(actorData);
  }

  /**
   * Prepare character-specific derived data
   * @param {Actor} actorData - The actor data
   * @private
   */
  _prepareCharacterData(actorData) {
    if (actorData.type !== 'character') return;

    const systemData = actorData.system;

    // Validate abilities exist
    if (!systemData.abilities) {
      console.warn(`Actor ${actorData.name} missing abilities data`);
      return;
    }

    // 1. Calculate ability modifiers and labels
    for (let [key, ability] of Object.entries(systemData.abilities)) {
      if (!ability) continue;
      ability.mod = ability.value ?? 0;
      ability.label = game.i18n.localize(CONFIG.RAVE.abilities[key]) ?? key;
    }

    // 2. Calculate encumbrance and armor class
    let totalSlots = 0;
    let acBonus = 0;
    let maxMainArmorBonus = 0;
    let hasCumbersome = false;
    
    for (const item of this.items) {
      if (!item?.system) continue;
      
      const weight = item.system.weight ?? 0;
      const quantity = item.system.quantity ?? 1;
      
      // Process armor items
      if (item.type === 'item' && item.system.itemType === CONFIG.RAVE.itemTypes.armor) {
        const armorBonus = item.system.acBonus ?? 0;
        
        // Accessory armor bonuses stack
        if (item.system.isAccessory) {
          acBonus += armorBonus;
        } else {
          // Main armor: only highest bonus applies
          maxMainArmorBonus = Math.max(maxMainArmorBonus, armorBonus);
        }
        
        // Check for cumbersome armor
        if (item.system.isCumbersome) {
          hasCumbersome = true;
        }
        
        totalSlots += weight;
      } else {
        // Regular items
        totalSlots += weight * quantity;
      }
    }

    // Add highest main armor bonus
    acBonus += maxMainArmorBonus;

    // 3. Calculate derived attributes
    const strVal = systemData.abilities.str?.value ?? 0;
    const dexVal = systemData.abilities.dex?.value ?? 0;

    // Item slots: current = total items, max = 10 + STR
    if (systemData.attributes?.slots) {
      systemData.attributes.slots.value = totalSlots;
      systemData.attributes.slots.max = 10 + strVal;
    }
    
    // Wounds: max = 10 + STR
    if (systemData.attributes?.wounds) {
      systemData.attributes.wounds.max = 10 + strVal;
    }

    // Armor Class: 10 + armor bonus + DEX (if not wearing cumbersome armor)
    if (systemData.attributes?.ac) {
      let finalAC = 10 + acBonus;
      
      // Add DEX bonus if not wearing cumbersome armor
      if (!hasCumbersome) {
        finalAC += dexVal;
      }
      
      systemData.attributes.ac.value = finalAC;
    }
  }

  /**
   * Prepare NPC-specific derived data
   * @param {Actor} actorData - The actor data
   * @private
   */
  _prepareNpcData(actorData) {
    if (actorData.type !== 'npc') return;
    
    const systemData = actorData.system;
    
    // Ensure CR has a default value
    if (typeof systemData.cr === 'undefined') {
      systemData.cr = 0;
    }
    
    // Ensure AC has a default value
    if (systemData.attributes?.ac && typeof systemData.attributes.ac.value === 'undefined') {
      systemData.attributes.ac.value = 10;
    }
  }

  /**
   * Prepare roll data for this actor
   * @returns {Object} Roll data
   */
  getRollData() {
    const data = { ...super.getRollData() };
    this._getCharacterRollData(data);
    this._getNpcRollData(data);
    return data;
  }

  /**
   * Prepare character-specific roll data
   * @param {Object} data - Roll data object
   * @private
   */
  _getCharacterRollData(data) {
    if (this.type !== 'character') return;
    
    // Add ability shortcuts
    if (data.abilities) {
      for (let [k, v] of Object.entries(data.abilities)) {
        data[k] = foundry.utils.deepClone(v);
      }
    }
    
    // Add level shortcut
    if (data.attributes?.level) {
      data.lvl = data.attributes.level.value ?? 0;
    }
  }

  /**
   * Prepare NPC-specific roll data
   * @param {Object} data - Roll data object
   * @private
   */
  _getNpcRollData(data) {
    if (this.type !== 'npc') return;
    
    // Add CR for easy access in formulas
    data.cr = data.cr ?? 0;
  }
}
