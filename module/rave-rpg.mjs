import { raveActor } from './documents/actor.mjs';
import { raveItem } from './documents/item.mjs';
import { raveActorSheet } from './sheets/actor-sheet.mjs';
import { raveItemSheet } from './sheets/item-sheet.mjs';
import { preloadHandlebarsTemplates } from './helpers/templates.mjs';
import { RAVE } from './helpers/config.mjs';

Hooks.once('init', function () {
  game.raverpg = {
    raveActor,
    raveItem,
    rollItemMacro,
  };

  CONFIG.RAVE = RAVE;

  CONFIG.Combat.initiative = {
    formula: '1d20 + @abilities.wil.value',
    decimals: 2,
  };

  CONFIG.Actor.documentClass = raveActor;
  CONFIG.Item.documentClass = raveItem;
  CONFIG.ActiveEffect.legacyTransferral = false;

  Actors.unregisterSheet('core', ActorSheet);
  Actors.registerSheet('rave-rpg', raveActorSheet, {
    makeDefault: true,
    label: 'RAVE.SheetLabels.Actor',
  });
  Items.unregisterSheet('core', ItemSheet);
  Items.registerSheet('rave-rpg', raveItemSheet, {
    makeDefault: true,
    label: 'RAVE.SheetLabels.Item',
  });

  // [수정됨] 헬퍼 등록을 여기서 직접 실행 (확실한 작동 보장)
  Handlebars.registerHelper('toLowerCase', function (str) {
    return str.toLowerCase();
  });

  Handlebars.registerHelper('eq', function (a, b) {
    return a === b;
  });

  return preloadHandlebarsTemplates();
});

Hooks.once('ready', function () {
  Hooks.on('hotbarDrop', (bar, data, slot) => createItemMacro(data, slot));
  
  // 채팅 메시지의 피해 버튼 클릭 이벤트 리스너
  Hooks.on('renderChatMessage', (message, html) => {
    html.find('.damage-button').click(async (event) => {
      event.preventDefault();
      const button = event.currentTarget;
      const itemId = button.dataset.itemId;
      const actorId = button.dataset.actorId;
      const mode = button.dataset.mode;
      const isCritical = button.dataset.crit === 'true';
      
      const actor = game.actors.get(actorId);
      if (!actor) return;
      
      const item = actor.items.get(itemId);
      if (!item) return;
      
      // NPC는 레벨(CR), 캐릭터는 능력치 사용
      let modifierVal;
      if (actor.type === 'npc') {
        modifierVal = actor.system.cr || 0;
      } else {
        const abilityKey = item.system.ability || 'str';
        modifierVal = actor.system.abilities[abilityKey].value;
      }
      
      let baseDamageStr = item.system.formula || "0";
      let finalDamageFormula = "";
      let modeLabel = "";
      
      if (mode === "enhanced") {
        finalDamageFormula = `{ ${baseDamageStr}, 1d12 }kh + ${modifierVal}`;
        modeLabel = game.i18n.localize("RAVE.SheetLabels.Enhanced");
      } else if (mode === "impaired") {
        finalDamageFormula = `{ ${baseDamageStr}, 1d4 }kl + ${modifierVal}`;
        modeLabel = game.i18n.localize("RAVE.SheetLabels.Impaired");
      } else {
        finalDamageFormula = `${baseDamageStr} + ${modifierVal}`;
        modeLabel = game.i18n.localize("RAVE.SheetLabels.Normal");
      }
      
      // 치명타면 피해 2배
      if (isCritical) {
        finalDamageFormula = `(${finalDamageFormula}) * 2`;
      }
      
      const damageRoll = new Roll(finalDamageFormula, actor.getRollData());
      await damageRoll.evaluate();
      
      const damageRollHTML = await damageRoll.render();
      const critText = isCritical ? ` (${game.i18n.localize("RAVE.SheetLabels.Critical")})` : '';
      
      const damageContent = `
        <div class="chat-card item-card">
          <header class="card-header flexrow">
            <img src="${item.img}" title="${item.name}" width="24" height="24"/>
            <h4 class="item-name" style="font-size: 1em; margin: 0;">${item.name} - ${modeLabel} 피해${critText}</h4>
          </header>
          ${damageRollHTML}
        </div>
      `;
      
      ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        content: damageContent,
        type: CONST.CHAT_MESSAGE_TYPES.ROLL,
        rolls: [damageRoll],
        sound: CONFIG.sounds.dice
      });
    });
  });
});

async function createItemMacro(data, slot) {
  if (data.type !== 'Item') return;
  if (!data.uuid.includes('Actor.') && !data.uuid.includes('Token.')) {
    return ui.notifications.warn(
      'You can only create macro buttons for owned Items'
    );
  }
  const item = await Item.fromDropData(data);
  const command = `game.raverpg.rollItemMacro("${data.uuid}");`;
  let macro = game.macros.find(
    (m) => m.name === item.name && m.command === command
  );
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
  const dropData = {
    type: 'Item',
    uuid: itemUuid,
  };
  Item.fromDropData(dropData).then((item) => {
    if (!item || !item.parent) {
      const itemName = item?.name ?? itemUuid;
      return ui.notifications.warn(
        `Could not find item ${itemName}. You may need to delete and recreate this macro.`
      );
    }
    item.roll();
  });
}