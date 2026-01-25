/**
 * Extend the base Item document
 * @extends {Item}
 */
export class raveItem extends Item {
  /**
   * Prepare data for the item
   */
  prepareData() {
    super.prepareData();
  }

  /**
   * Handle rolling this item
   * @returns {Promise<void>}
   */
  async roll() {
    const item = this;
    const actor = this.actor;

    if (!actor) {
      ui.notifications.warn(game.i18n.localize("RAVE.SheetLabels.NoActor") || "This item has no associated actor.");
      return;
    }

    const itemType = item.system?.itemType;

    // Handle spell type
    if (itemType === CONFIG.RAVE.itemTypes.spell) {
      return this._rollSpell(item, actor);
    }

    // Handle non-weapon items: display description in chat
    if (itemType !== CONFIG.RAVE.itemTypes.weapon) {
      return this._displayItemInChat(item, actor);
    }

    // Handle weapon: roll attack
    return this._rollWeaponAttack(item, actor);
  }

  /**
   * Roll a spell check
   * @param {Item} item - The spell item
   * @param {Actor} actor - The actor casting the spell
   * @returns {Promise<void>}
   * @private
   */
  async _rollSpell(item, actor) {
    const spellLevel = item.system.spellLevel || 0;
    const dc = 10 + spellLevel;
    
    const content = `
      <form>
        <div class="form-group">
          <label style="font-weight:bold;">${game.i18n.localize("RAVE.SheetLabels.SpellLevel")}</label>
          <input type="text" name="spellLevel" value="${spellLevel}" data-dtype="Number" style="width: 100%; box-sizing: border-box;"/>
        </div>
        <div class="form-group" style="margin-top: 10px;">
          <label style="font-weight:bold;">${game.i18n.localize("RAVE.SheetLabels.SpellDC")} (${game.i18n.localize("RAVE.SheetLabels.AutoCalculate") || "자동 계산"}: 10 + ${game.i18n.localize("RAVE.SheetLabels.SpellLevel")})</label>
          <input type="text" name="dc" value="${dc}" data-dtype="Number" disabled style="width: 100%; box-sizing: border-box; background-color: #e0e0e0;"/>
        </div>
      </form>
    `;

    new Dialog({
      title: `${item.name} - ${game.i18n.localize("RAVE.SheetLabels.SpellCheck")}`,
      content: content,
      buttons: {
        roll: {
          label: game.i18n.localize("RAVE.SheetLabels.Roll"),
          icon: '<i class="fas fa-dice-d20"></i>',
          callback: async (html) => {
            const inputSpellLevel = parseInt(html.find('[name="spellLevel"]').val()) || 0;
            const finalDc = 10 + inputSpellLevel;
            
            // Roll against WIL ability
            const wilVal = actor.system.abilities?.wil?.value ?? 0;
            const rollFormula = `1d20 + ${wilVal}`;
            const roll = new Roll(rollFormula, actor.getRollData());
            await roll.evaluate();
            
            const total = roll.total;
            const success = total >= finalDc;
            const successText = success 
              ? game.i18n.localize("RAVE.SheetLabels.Success") 
              : game.i18n.localize("RAVE.SheetLabels.Failure");
            const successStyle = success 
              ? 'color: green; font-weight: bold;' 
              : 'color: red; font-weight: bold;';
            
            const description = await TextEditor.enrichHTML(item.system.description, { async: true });
            const rollHTML = await roll.render();
            
            const messageContent = `
              <div class="chat-card item-card">
                  <header class="card-header flexrow">
                      <img src="${item.img}" title="${item.name}" width="24" height="24"/>
                      <h4 class="item-name" style="font-size: 1em; margin: 0;">${item.name}</h4>
                  </header>
                  
                  <div class="card-content">
                      ${description}
                  </div>

                  <div style="margin-top: 10px; font-weight: bold;">
                      ${game.i18n.localize("RAVE.SheetLabels.SpellCheck")} (${game.i18n.localize("RAVE.Ability.Wil.long")})
                  </div>
                  <div style="margin-bottom: 10px;">
                      ${game.i18n.localize("RAVE.SheetLabels.SpellDC")}: ${finalDc}
                  </div>
                  ${rollHTML}
                  
                  <div style="margin-top: 10px; padding: 8px; background-color: #f5f5f5; border-radius: 4px;">
                      <span style="${successStyle}">${successText}</span>
                  </div>
              </div>
            `;

            ChatMessage.create({
              user: game.user.id,
              speaker: ChatMessage.getSpeaker({ actor: actor }),
              content: messageContent,
              type: CONST.CHAT_MESSAGE_TYPES.ROLL,
              rolls: [roll],
              sound: CONFIG.sounds.dice
            });
          }
        }
      },
      default: "roll"
    }).render(true);
  }

  /**
   * Display item description in chat
   * @param {Item} item - The item to display
   * @param {Actor} actor - The actor using the item
   * @returns {Promise<void>}
   * @private
   */
  async _displayItemInChat(item, actor) {
    const description = await TextEditor.enrichHTML(item.system.description, { async: true });
    ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: actor }),
      content: `
          <div class="chat-card item-card">
              <header class="card-header flexrow">
                  <img src="${item.img}" title="${item.name}" width="24" height="24"/>
                  <h4 class="item-name" style="font-size: 1em; margin: 0;">${item.name}</h4>
              </header>
              <div class="card-content">
                  ${description}
              </div>
          </div>
      `
    });
  }

  /**
   * Roll a weapon attack
   * @param {Item} item - The weapon item
   * @param {Actor} actor - The actor attacking
   * @returns {Promise<void>}
   * @private
   */
  async _rollWeaponAttack(item, actor) {
    // Determine base modifier
    let baseModifier = 0;
    
    if (actor.type === 'npc') {
      baseModifier = actor.system.cr ?? 0;
    } else {
      const abilityKey = item.system.ability || 'str';
      baseModifier = actor.system.abilities?.[abilityKey]?.value ?? 0;
    }
    
    // Prompt for additional modifier
    let modifierInput = await this._promptForModifier(item.name);
    if (modifierInput === null) return; // User cancelled
    
    const totalModifier = baseModifier + modifierInput;
    const attackFormula = `1d20 + ${totalModifier}`;
    
    const attackRoll = new Roll(attackFormula, actor.getRollData());
    await attackRoll.evaluate();
    
    const d20Result = attackRoll.terms[0].results[0].result;
    const isCritical = d20Result === 20;
    
    const description = await TextEditor.enrichHTML(item.system.description, { async: true });
    const attackRollHTML = await attackRoll.render();
    
    const criticalText = isCritical 
      ? `<div style="margin-top: 10px; padding: 8px; background-color: #ffd700; color: #000; font-weight: bold; text-align: center; border-radius: 4px;">${game.i18n.localize("RAVE.SheetLabels.Critical")}</div>` 
      : '';
    
    const messageContent = `
        <div class="chat-card item-card">
            <header class="card-header flexrow">
                <img src="${item.img}" title="${item.name}" width="24" height="24"/>
                <h4 class="item-name" style="font-size: 1em; margin: 0;">${item.name}</h4>
            </header>
            
            <div class="card-content">
                ${description}
            </div>

            <div style="margin-top: 10px; font-weight: bold;">
                ${game.i18n.localize("RAVE.SheetLabels.RollAttack")}
            </div>
            ${attackRollHTML}
            ${criticalText}
            
            <div style="margin-top: 10px; display: flex; flex-direction: column; gap: 5px;">
                <button class="damage-button" data-item-id="${item.id}" data-actor-id="${actor.id}" data-mode="normal" data-crit="${isCritical}" style="padding: 5px; cursor: pointer;">
                    ${game.i18n.localize("RAVE.SheetLabels.RollNormalDamage")}
                </button>
                <button class="damage-button" data-item-id="${item.id}" data-actor-id="${actor.id}" data-mode="enhanced" data-crit="${isCritical}" style="padding: 5px; cursor: pointer;">
                    ${game.i18n.localize("RAVE.SheetLabels.RollEnhancedDamage")}
                </button>
                <button class="damage-button" data-item-id="${item.id}" data-actor-id="${actor.id}" data-mode="impaired" data-crit="${isCritical}" style="padding: 5px; cursor: pointer;">
                    ${game.i18n.localize("RAVE.SheetLabels.RollImpairedDamage")}
                </button>
            </div>
        </div>
    `;

    ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        content: messageContent,
        type: CONST.CHAT_MESSAGE_TYPES.ROLL,
        rolls: [attackRoll],
        sound: CONFIG.sounds.dice
    });
  }

  /**
   * Prompt user for an additional modifier
   * @param {string} itemName - Name of the item for the dialog title
   * @returns {Promise<number|null>} The modifier value, or null if cancelled
   * @private
   */
  async _promptForModifier(itemName) {
    return new Promise(resolve => {
      const dialogContent = `<div style="text-align: center;">
        <label style="display: block; margin-bottom: 10px;">${game.i18n.localize("RAVE.SheetLabels.AddModifier")}:</label>
        <input type="number" id="modifier-input" value="0" style="width: 60px; padding: 4px; text-align: center;" />
      </div>`;
      
      new Dialog({
        title: `${itemName} - ${game.i18n.localize("RAVE.SheetLabels.Attack")}`,
        content: dialogContent,
        buttons: {
          roll: {
            label: game.i18n.localize("RAVE.SheetLabels.Roll"),
            callback: (html) => {
              const input = html.find('#modifier-input').val();
              resolve(parseInt(input) || 0);
            }
          },
          cancel: {
            label: game.i18n.localize("RAVE.SheetLabels.Cancel"),
            callback: () => resolve(null)
          }
        },
        default: "roll",
        close: () => resolve(null)
      }).render(true);
    });
  }
}
