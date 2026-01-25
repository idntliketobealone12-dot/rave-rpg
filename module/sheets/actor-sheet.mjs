import { onManageActiveEffect, prepareActiveEffectCategories } from '../helpers/effects.mjs';

/**
 * Extend the basic ActorSheet
 * @extends {ActorSheet}
 */
export class raveActorSheet extends ActorSheet {
  /**
   * @override
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['rave-rpg', 'sheet', 'actor'],
      width: 600,
      height: 600,
      tabs: [{ navSelector: '.sheet-tabs', contentSelector: '.sheet-body', initial: 'features' }],
    });
  }

  /**
   * @override
   */
  get template() {
    return `systems/rave-rpg/templates/actor/actor-${this.actor.type}-sheet.hbs`;
  }

  /**
   * @override
   */
  getData() {
    const context = super.getData();
    const actorData = context.data;
    context.system = actorData.system;
    context.flags = actorData.flags;

    if (actorData.type === 'character') {
      this._prepareItems(context);
      this._prepareCharacterData(context);
    }
    if (actorData.type === 'npc') {
      this._prepareItems(context);
    }

    context.rollData = context.actor.getRollData();
    context.effects = prepareActiveEffectCategories(this.actor.allApplicableEffects());
    
    // 부상이 있는지 확인
    context.hasWounds = false;
    if (context.effects && typeof context.effects === 'object') {
      for (let section of Object.values(context.effects)) {
        if (section.effects && Array.isArray(section.effects)) {
          if (section.effects.some(effect => effect.flags?.['rave-rpg']?.isWound)) {
            context.hasWounds = true;
            break;
          }
        }
      }
    }

    return context;
  }

  /**
   * Organize and classify items for character sheets
   * @param {Object} context - Sheet context data
   * @private
   */
  _prepareCharacterData(context) {
    for (let [k, v] of Object.entries(context.system.abilities)) {
      v.label = game.i18n.localize(CONFIG.RAVE.abilities[k]) ?? k;
    }
  }

  /**
   * Organize and classify items for character sheets
   * @param {Object} context - Sheet context data
   * @private
   */
  _prepareItems(context) {
    const features = [];
    const itemsByType = {
      general: [],
      weapon: [],
      spell: [],
      mystery: [],
      armor: []
    };

    for (let i of context.items) {
      i.img = i.img || Item.DEFAULT_ICON;
      
      if (i.type === 'feature') {
        features.push(i);
      } else if (i.type === 'item') {
        const itemType = i.system.itemType || 'general';
        if (itemsByType[itemType]) {
          itemsByType[itemType].push(i);
        }
      }
    }
    
    context.features = features;
    context.itemsByType = itemsByType;
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.on('click', '.item-edit', (ev) => {
      const li = $(ev.currentTarget).parents('.item');
      const item = this.actor.items.get(li.data('itemId'));
      item.sheet.render(true);
    });

    if (!this.isEditable) return;

    html.on('click', '.item-create', this._onItemCreate.bind(this));
    html.on('click', '.item-delete', (ev) => {
      const li = $(ev.currentTarget).closest('.item');
      const itemId = li.data('item-id');
      const item = this.actor.items.get(itemId);
      if (item) {
        item.delete();
        li.slideUp(200, () => this.render(false));
      }
    });
    html.on('click', '.effect-control', (ev) => {
      const row = ev.currentTarget.closest('li');
      const document = row.dataset.parentId === this.actor.id ? this.actor : this.actor.items.get(row.dataset.parentId);
      onManageActiveEffect(ev, document);
    });
    html.on('click', '.rollable', this._onRoll.bind(this));
    html.on('click', '.weapon-attack-button', this._onWeaponAttack.bind(this));
    html.on('click', '.spell-cast-button', this._onSpellCast.bind(this));
    html.on('click', '.item-name-toggle', this._onItemNameToggle.bind(this));
    html.on('dblclick', '.item-name-toggle', this._onItemNameDblClick.bind(this));
    html.on('click', '.add-wound-button', this._onAddWound.bind(this));
    html.on('click', '.wound-delete-btn', this._onWoundDelete.bind(this));
    html.on('click', '.npc-ability-roll', this._onNpcAbilityRoll.bind(this));

    if (this.actor.isOwner) {
      let handler = (ev) => this._onDragStart(ev);
      html.find('li.item').each((i, li) => {
        if (li.classList.contains('inventory-header')) return;
        li.setAttribute('draggable', true);
        li.addEventListener('dragstart', handler, false);
      });
    }
  }

  async _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    const type = header.dataset.type;
    const data = foundry.utils.deepClone(header.dataset);
    const name = `New ${type.capitalize()}`;
    const itemData = { name: name, type: type, system: data };
    delete itemData.system['type'];
    return await Item.create(itemData, { parent: this.actor });
  }

  async _onRoll(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const dataset = element.dataset;

    if (dataset.rollType) {
      if (dataset.rollType === 'item') {
        const itemId = element.closest('.item').dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (item) return item.roll();
      }
    }

    if (dataset.roll) {
      let label = dataset.label ? `[${game.i18n.localize("RAVE.SheetLabels.Check") || "판정"}] ${dataset.label}` : '';
      
      const content = `
        <div class="form-group">
            <label style="font-weight:bold; display:block; margin-bottom:5px;">${game.i18n.localize("RAVE.SheetLabels.AddModifier")} (${game.i18n.localize("RAVE.SheetLabels.ModifierPlaceholder")})</label>
            <input type="text" name="modifier" value="" placeholder="0" style="width: 100%; box-sizing: border-box;" autofocus/>
        </div>
      `;

      new Dialog({
        title: `${dataset.label || game.i18n.localize("RAVE.SheetLabels.Ability") || "능력치"} ${game.i18n.localize("RAVE.SheetLabels.Check") || "판정"}`,
        content: content,
        buttons: {
          roll: {
            icon: '<i class="fas fa-dice-d20"></i>',
            label: game.i18n.localize("RAVE.SheetLabels.Roll"),
            callback: async (html) => {
              const modifier = html.find('[name="modifier"]').val();
              const formula = modifier ? `${dataset.roll} + ${modifier}` : dataset.roll;
              const roll = new Roll(formula, this.actor.getRollData());
              await roll.toMessage({
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                flavor: label,
                rollMode: game.settings.get('core', 'rollMode'),
              });
            }
          }
        },
        default: "roll",
        close: () => {}
      }).render(true);
    }
  }

  async _onWeaponAttack(event) {
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget;
    const itemId = button.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (item && item.system.itemType === 'weapon') {
      return item.roll();
    }
  }

  async _onSpellCast(event) {
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget;
    const itemId = button.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (item && item.system.itemType === 'spell') {
      return item.roll();
    }
  }

  /**
   * Toggle item description visibility
   * @param {Event} event - The click event
   * @private
   */
  async _onItemNameToggle(event) {
    event.preventDefault();
    const header = $(event.currentTarget);
    const li = header.closest('.item');
    const description = li.find('.item-description');
    const icon = header.find('.item-toggle-icon');
    
    // Toggle description with slide animation
    description.slideToggle(200);
    
    // Rotate chevron icon
    if (description.is(':visible')) {
      icon.css('transform', 'rotate(90deg)');
    } else {
      icon.css('transform', 'rotate(0deg)');
    }
  }

  async _onItemNameDblClick(event) {
    event.preventDefault();
    const li = $(event.currentTarget).parents('.item');
    const item = this.actor.items.get(li.data('itemId'));
    if (item) {
      item.sheet.render(true);
    }
  }

  async _onAddWound(event) {
    event.preventDefault();
    const woundName = document.getElementById('wound-name').value;
    const woundSlots = parseInt(document.getElementById('wound-slots').value) || 1;
    
    if (!woundName.trim()) {
      ui.notifications.warn(game.i18n.localize("RAVE.SheetLabels.WoundNameRequired"));
      return;
    }
    
    const woundLabel = game.i18n.localize("RAVE.SheetLabels.Wound") || "부상";
    
    // Active Effect로 부상 추가
    const effectData = {
      name: `${woundLabel}: ${woundName}`,
      icon: 'icons/svg/blood.svg',
      changes: [
        {
          key: 'system.attributes.wounds.value',
          mode: CONST.ACTIVE_EFFECT_MODES.ADD,
          value: woundSlots
        }
      ],
      flags: {
        'rave-rpg': {
          isWound: true,
          woundSlots: woundSlots
        }
      }
    };
    
    await this.actor.createEmbeddedDocuments('ActiveEffect', [effectData]);
    
    // 입력 필드 초기화
    document.getElementById('wound-name').value = '';
    document.getElementById('wound-slots').value = '1';
    
    const slotsLabel = game.i18n.localize("RAVE.SheetLabels.Slots") || "칸";
    ui.notifications.info(`${woundLabel} "${woundName}" (${woundSlots}${slotsLabel}) ${game.i18n.localize("RAVE.SheetLabels.WoundAdded")}`);
  }

  async _onNpcAbilityRoll(event) {
    event.preventDefault();
    const crVal = this.actor.system.cr || 0;
    
    const content = `
      <div class="form-group">
          <label style="font-weight:bold; display:block; margin-bottom:5px;">${game.i18n.localize("RAVE.SheetLabels.AddModifier")} (${game.i18n.localize("RAVE.SheetLabels.ModifierPlaceholder")})</label>
          <input type="text" name="modifier" value="" placeholder="0" style="width: 100%; box-sizing: border-box;" autofocus/>
      </div>
    `;

    new Dialog({
      title: `${this.actor.name} - d20+${game.i18n.localize("RAVE.Attributes.Level") || "레벨"} ${game.i18n.localize("RAVE.SheetLabels.Check") || "판정"}`,
      content: content,
      buttons: {
        roll: {
          icon: '<i class="fas fa-dice-d20"></i>',
          label: game.i18n.localize("RAVE.SheetLabels.Roll"),
          callback: async (html) => {
            const modifier = html.find('[name="modifier"]').val();
            const formula = modifier ? `1d20 + ${crVal} + ${modifier}` : `1d20 + ${crVal}`;
            const roll = new Roll(formula, this.actor.getRollData());
            await roll.toMessage({
              speaker: ChatMessage.getSpeaker({ actor: this.actor }),
              rollMode: game.settings.get('core', 'rollMode'),
            });
          }
        }
      },
      default: "roll",
      close: () => {}
    }).render(true);
  }

  /**
   * 부상 제거 핸들러
   * @param {Event} event - 클릭 이벤트
   * @private
   */
  async _onWoundDelete(event) {
    event.preventDefault();
    const effectId = event.currentTarget.dataset.effectId;
    const effect = this.actor.effects.get(effectId);
    if (effect) {
      await effect.delete();
    }
  }
}