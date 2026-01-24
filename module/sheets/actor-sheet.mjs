import { onManageActiveEffect, prepareActiveEffectCategories } from '../helpers/effects.mjs';

export class raveActorSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['rave-rpg', 'sheet', 'actor'],
      width: 600,
      height: 600,
      tabs: [{ navSelector: '.sheet-tabs', contentSelector: '.sheet-body', initial: 'features' }],
    });
  }

  get template() {
    return `systems/rave-rpg/templates/actor/actor-${this.actor.type}-sheet.hbs`;
  }

  getData() {
    const context = super.getData();
    const actorData = context.data;
    context.system = actorData.system;
    context.flags = actorData.flags;

    if (actorData.type == 'character') {
      this._prepareItems(context);
      this._prepareCharacterData(context);
    }
    if (actorData.type == 'npc') {
      this._prepareItems(context);
    }

    context.rollData = context.actor.getRollData();
    context.effects = prepareActiveEffectCategories(this.actor.allApplicableEffects());

    return context;
  }

  _prepareCharacterData(context) {
    for (let [k, v] of Object.entries(context.system.abilities)) {
      v.label = game.i18n.localize(CONFIG.RAVE.abilities[k]) ?? k;
    }
  }

  _prepareItems(context) {
    const gear = [];
    const features = [];

    for (let i of context.items) {
      i.img = i.img || Item.DEFAULT_ICON;
      if (i.type === 'item') gear.push(i);
      else if (i.type === 'feature') features.push(i);
    }
    context.gear = gear;
    context.features = features;
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
      const li = $(ev.currentTarget).parents('.item');
      const item = this.actor.items.get(li.data('itemId'));
      item.delete();
      li.slideUp(200, () => this.render(false));
    });
    html.on('click', '.effect-control', (ev) => {
      const row = ev.currentTarget.closest('li');
      const document = row.dataset.parentId === this.actor.id ? this.actor : this.actor.items.get(row.dataset.parentId);
      onManageActiveEffect(ev, document);
    });
    html.on('click', '.rollable', this._onRoll.bind(this));

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
    const data = duplicate(header.dataset);
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
      if (dataset.rollType == 'item') {
        const itemId = element.closest('.item').dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (item) return item.roll();
      }
    }

    if (dataset.roll) {
      let label = dataset.label ? `[판정] ${dataset.label}` : '';
      
      const content = `
        <div class="form-group">
            <label style="font-weight:bold; display:block; margin-bottom:5px;">추가 수정치 (예: +2, -5)</label>
            <input type="text" name="modifier" value="" placeholder="0" style="width: 100%; box-sizing: border-box;" autofocus/>
        </div>
      `;

      new Dialog({
        title: `${dataset.label || '능력치'} 판정`,
        content: content,
        buttons: {
          roll: {
            icon: '<i class="fas fa-dice-d20"></i>',
            label: "굴리기",
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
}