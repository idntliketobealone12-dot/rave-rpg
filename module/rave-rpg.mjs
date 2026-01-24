import { raveActor } from './documents/actor.mjs';
import { raveItem } from './documents/item.mjs';
import { raveActorSheet } from './sheets/actor-sheet.mjs';
import { raveItemSheet } from './sheets/item-sheet.mjs';
import { preloadHandlebarsTemplates } from './helpers/templates.mjs';
import { RAVE } from './helpers/config.mjs';

Hooks.once('init', function () {
  game.raverpg = { raveActor, raveItem, rollItemMacro };
  CONFIG.RAVE = RAVE;

  CONFIG.Combat.initiative = {
    formula: '1d20 + @abilities.wil.value',
    decimals: 2,
  };

  CONFIG.Actor.documentClass = raveActor;
  CONFIG.Item.documentClass = raveItem;
  CONFIG.ActiveEffect.legacyTransferral = false;

  Actors.unregisterSheet('core', ActorSheet);
  Actors.registerSheet('rave-rpg', raveActorSheet, { makeDefault: true, label: 'RAVE.SheetLabels.Actor' });
  Items.unregisterSheet('core', ItemSheet);
  Items.registerSheet('rave-rpg', raveItemSheet, { makeDefault: true, label: 'RAVE.SheetLabels.Item' });

  return preloadHandlebarsTemplates();
});

Hooks.once('ready', function () {
  Hooks.on('hotbarDrop', (bar, data, slot) => createItemMacro(data, slot));
});

async function createItemMacro(data, slot) {
  if (data.type !== 'Item') return;
  if (!data.uuid.includes('Actor.') && !data.uuid.includes('Token.')) {
    return ui.notifications.warn('You can only create macro buttons for owned Items');
  }
  const item = await Item.fromDropData(data);
  const command = `game.raverpg.rollItemMacro("${data.uuid}");`;
  let macro = game.macros.find((m) => m.name === item.name && m.command === command);
  if (!macro) {
    macro = await Macro.create({
      name: item.name,
      type: 'script',
      img: item.img,
      command: command,
      flags: { 'rave-rpg.itemMacro': true },
    });
  }
  game.user.assignHotbarMacro(macro, slot);
  return false;
}

function rollItemMacro(itemUuid) {
  const dropData = { type: 'Item', uuid: itemUuid };
  Item.fromDropData(dropData).then((item) => {
    if (!item || !item.parent) {
      const itemName = item?.name ?? itemUuid;
      return ui.notifications.warn(`Could not find item ${itemName}.`);
    }
    item.roll();
  });
}
