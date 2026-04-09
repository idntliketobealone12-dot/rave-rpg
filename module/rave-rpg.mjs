/**
 * RAVE RPG System for Foundry VTT
 * Author: blue_sphere
 * Software License: MIT
 */

import { raveActor } from './documents/actor.mjs';
import { raveItem } from './documents/item.mjs';
import { raveActorSheet } from './sheets/actor-sheet.mjs';
import { raveItemSheet } from './sheets/item-sheet.mjs';
import { preloadHandlebarsTemplates } from './helpers/templates.mjs';
import { RAVE } from './helpers/config.mjs';

const DAMAGE_FLAG_SCOPE = 'rave-rpg';
const DAMAGE_FLAG_KEY = 'damageData';

/**
 * Initialize the RAVE RPG system
 * Set up configuration, register sheets, and preload templates
 */
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

  // Register Handlebars helpers
  Handlebars.registerHelper('toLowerCase', function (str) {
    return str.toLowerCase();
  });

  Handlebars.registerHelper('eq', function (a, b) {
    return a === b;
  });

  return preloadHandlebarsTemplates();
});

/**
 * Ready hook - set up runtime functionality
 * Register macro creation and chat message handlers
 */
Hooks.once('ready', function () {
  Hooks.on('hotbarDrop', (bar, data, slot) => createItemMacro(data, slot));

  Hooks.on('renderChatMessage', (message, html) => {
    html.find('.damage-button').on('click', async (event) => {
      event.preventDefault();
      await handleDamageButtonClick(event.currentTarget);
    });

    html.find('.damage-die-remove').on('click', async (event) => {
      event.preventDefault();
      await handleDamageDieRemove(message, event.currentTarget);
    });
  });
});

async function handleDamageButtonClick(button) {
  const itemId = button.dataset.itemId;
  const actorId = button.dataset.actorId;
  const mode = button.dataset.mode;
  const isCritical = button.dataset.crit === 'true';

  const actor = game.actors.get(actorId);
  if (!actor) return;

  const item = actor.items.get(itemId);
  if (!item) return;

  const options = await promptForDamageOptions(item, mode);
  if (!options) return;

  try {
    const { damageData, rolls } = await buildDamageMessageData({
      actor,
      item,
      mode,
      isCritical,
      options,
    });

    await ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor }),
      content: renderDamageMessageContent(damageData),
      type: CONST.CHAT_MESSAGE_TYPES.ROLL,
      rolls,
      sound: CONFIG.sounds.dice,
      flags: {
        [DAMAGE_FLAG_SCOPE]: {
          [DAMAGE_FLAG_KEY]: damageData,
        },
      },
    });
  } catch (error) {
    console.error('Failed to roll structured damage', error);
    ui.notifications.error(localize('RAVE.SheetLabels.DamageRollFailed', '피해 굴림을 처리하지 못했습니다. 공식을 확인해주세요.'));
  }
}

async function handleDamageDieRemove(message, button) {
  if (!message.isOwner) {
    ui.notifications.warn(localize('RAVE.SheetLabels.CannotEditDamageMessage', '이 피해 메시지는 수정할 수 없습니다.'));
    return;
  }

  const dieId = button.dataset.dieId;
  const damageData = foundry.utils.deepClone(message.getFlag(DAMAGE_FLAG_SCOPE, DAMAGE_FLAG_KEY));
  if (!damageData) return;

  const dieEntry = findDamageDie(damageData, dieId);
  if (!dieEntry || !dieEntry.component?.included || !dieEntry.die?.active) return;

  dieEntry.die.active = false;
  calculateDamageTotals(damageData);

  await message.setFlag(DAMAGE_FLAG_SCOPE, DAMAGE_FLAG_KEY, damageData);
  await message.update({
    content: renderDamageMessageContent(damageData),
  });
}

async function promptForDamageOptions(item, mode) {
  return new Promise((resolve) => {
    let settled = false;
    const complete = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const content = `
      <form>
        <div class="form-group">
          <label style="font-weight: bold; display: block; margin-bottom: 4px;">${localize('RAVE.SheetLabels.DamageMode', '피해 모드')}</label>
          <input type="text" value="${escapeHtml(getModeLabel(mode))}" disabled style="width: 100%; box-sizing: border-box;" />
        </div>
        <div class="form-group" style="margin-top: 10px;">
          <label style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" name="useExtraDice" />
            ${localize('RAVE.SheetLabels.UseExtraDice', '추가 다이스 사용')}
          </label>
        </div>
        <div class="form-group" style="margin-top: 10px;">
          <label style="font-weight: bold; display: block; margin-bottom: 4px;">${localize('RAVE.SheetLabels.ExtraDiceFormula', '추가 다이스 공식')}</label>
          <input type="text" name="extraDiceFormula" value="" placeholder="1d6" style="width: 100%; box-sizing: border-box;" />
          <p style="margin: 4px 0 0; font-size: 12px; color: #666;">${localize('RAVE.SheetLabels.ExtraDiceHint', '예: 1d6, 1d8 + 1d4')}</p>
        </div>
        <div class="form-group" style="margin-top: 10px;">
          <label style="font-weight: bold; display: block; margin-bottom: 4px;">${localize('RAVE.SheetLabels.ExtraFlatModifier', '추가 고정 피해')}</label>
          <input type="number" name="extraFlatModifier" value="0" style="width: 100%; box-sizing: border-box;" />
        </div>
      </form>
    `;

    new Dialog({
      title: `${item.name} - ${localize('RAVE.SheetLabels.DamageOptions', '피해 옵션')}`,
      content,
      buttons: {
        roll: {
          icon: '<i class="fas fa-dice-d6"></i>',
          label: localize('RAVE.SheetLabels.Roll', '굴리기'),
          callback: (html) => {
            const useExtraDice = html.find('[name="useExtraDice"]').is(':checked');
            const extraDiceFormula = String(html.find('[name="extraDiceFormula"]').val() ?? '').trim();
            const extraFlatModifier = Number(html.find('[name="extraFlatModifier"]').val() || 0);

            if (useExtraDice && !extraDiceFormula) {
              ui.notifications.warn(localize('RAVE.SheetLabels.ExtraDiceFormulaRequired', '추가 다이스 공식을 입력해주세요.'));
              complete(null);
              return;
            }

            complete({
              useExtraDice,
              extraDiceFormula,
              extraFlatModifier,
            });
          },
        },
        cancel: {
          label: localize('RAVE.SheetLabels.Cancel', '취소'),
          callback: () => complete(null),
        },
      },
      default: 'roll',
      close: () => complete(null),
    }).render(true);
  });
}

async function buildDamageMessageData({ actor, item, mode, isCritical, options }) {
  const baseFormula = item.system.formula || '0';
  const modifierValue = getDamageModifier(actor, item);
  const modeFormula = getModeFormula(mode);
  const comparisonBehavior = getModeComparisonBehavior(mode);
  const components = [];
  const rolls = [];

  const baseRollResult = await evaluateDamageComponent({
    actor,
    formula: baseFormula,
    id: 'base',
    label: localize('RAVE.SheetLabels.BaseDamage', '기본 피해'),
  });
  components.push(baseRollResult.component);
  rolls.push(baseRollResult.roll);

  let comparison = null;
  if (modeFormula && comparisonBehavior) {
    const modeRollResult = await evaluateDamageComponent({
      actor,
      formula: modeFormula,
      id: 'mode',
      label: getModeComparisonLabel(mode),
    });
    components.push(modeRollResult.component);
    rolls.push(modeRollResult.roll);

    const chooseMode = comparisonBehavior === 'highest'
      ? modeRollResult.component.total > baseRollResult.component.total
      : modeRollResult.component.total < baseRollResult.component.total;

    baseRollResult.component.included = !chooseMode;
    modeRollResult.component.included = chooseMode;
    comparison = {
      behavior: comparisonBehavior,
      selectedComponentId: chooseMode ? modeRollResult.component.id : baseRollResult.component.id,
    };
  } else {
    baseRollResult.component.included = true;
  }

  if (options.useExtraDice && options.extraDiceFormula) {
    const extraRollResult = await evaluateDamageComponent({
      actor,
      formula: options.extraDiceFormula,
      id: 'extra',
      label: localize('RAVE.SheetLabels.ExtraDamage', '추가 피해'),
    });
    extraRollResult.component.included = true;
    components.push(extraRollResult.component);
    rolls.push(extraRollResult.roll);
  }

  const damageData = {
    actorId: actor.id,
    itemId: item.id,
    itemName: item.name,
    itemImg: item.img,
    mode,
    modeLabel: getModeLabel(mode),
    isCritical,
    critMultiplier: isCritical ? 2 : 1,
    components,
    comparison,
    modifier: {
      base: modifierValue,
      extra: Number(options.extraFlatModifier) || 0,
      total: modifierValue + (Number(options.extraFlatModifier) || 0),
    },
  };

  calculateDamageTotals(damageData);
  return { damageData, rolls };
}

async function evaluateDamageComponent({ actor, formula, id, label }) {
  const roll = new Roll(formula, actor.getRollData());
  await roll.evaluate();

  const rendered = await roll.render();
  const dice = extractDamageDice(roll, id);
  const diceTotal = dice.reduce((sum, die) => sum + die.result, 0);
  const total = Number(roll.total) || 0;

  return {
    roll,
    component: {
      id,
      label,
      formula,
      rendered,
      total,
      staticTotal: total - diceTotal,
      included: true,
      removable: true,
      dice,
    },
  };
}

function extractDamageDice(roll, componentId) {
  const dice = [];
  let dieIndex = 0;

  for (const dieTerm of roll.dice ?? []) {
    for (const result of dieTerm.results ?? []) {
      if (result.active === false || result.discarded) continue;
      const value = Number(result.result);
      if (!Number.isFinite(value)) continue;

      dice.push({
        id: `${componentId}-die-${dieIndex}`,
        faces: dieTerm.faces,
        result: value,
        active: true,
      });
      dieIndex += 1;
    }
  }

  return dice;
}

function calculateDamageTotals(damageData) {
  let componentTotal = 0;

  for (const component of damageData.components) {
    const activeDiceTotal = (component.dice ?? [])
      .filter((die) => die.active)
      .reduce((sum, die) => sum + die.result, 0);

    component.activeDiceTotal = activeDiceTotal;
    component.currentTotal = component.included ? component.staticTotal + activeDiceTotal : 0;
    componentTotal += component.currentTotal;
  }

  const modifierTotal = Number(damageData.modifier?.total) || 0;
  const preCriticalTotal = componentTotal + modifierTotal;
  const finalTotal = preCriticalTotal * (damageData.critMultiplier || 1);

  damageData.totals = {
    componentTotal,
    modifierTotal,
    preCriticalTotal,
    finalTotal,
  };

  return damageData;
}

function renderDamageMessageContent(damageData) {
  calculateDamageTotals(damageData);

  const componentsHtml = damageData.components
    .map((component) => renderDamageComponent(component, damageData.comparison))
    .join('');

  const removableDice = getRemovableDamageDice(damageData);
  const removableDiceHtml = removableDice.length
    ? `
      <div style="margin-top: 10px; display: flex; flex-direction: column; gap: 6px;">
        <div style="font-weight: bold;">${localize('RAVE.SheetLabels.RemovableDice', '제거 가능한 다이스')}</div>
        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
          ${removableDice.map((entry) => `
            <button
              type="button"
              class="damage-die-remove"
              data-die-id="${entry.die.id}"
              style="padding: 4px 8px; cursor: pointer; border: 1px solid #111; border-radius: 4px; background: #fff;"
            >
              ${localize('RAVE.SheetLabels.RemoveDie', '다이스 제거')} d${entry.die.faces} (${entry.die.result})
            </button>
          `).join('')}
        </div>
      </div>
    `
    : '';

  const removedDice = getRemovedDamageDice(damageData);
  const removedDiceHtml = removedDice.length
    ? `
      <div style="margin-top: 8px; font-size: 12px; color: #666;">
        <strong>${localize('RAVE.SheetLabels.RemovedDice', '제거된 다이스')}:</strong>
        ${removedDice.map((entry) => `d${entry.die.faces} (${entry.die.result})`).join(', ')}
      </div>
    `
    : '';

  const critText = damageData.isCritical ? ` (${localize('RAVE.SheetLabels.Critical', '치명타!')})` : '';
  const selectedSummary = damageData.comparison
    ? `<div style="margin-top: 6px; color: #555;">${localize('RAVE.SheetLabels.SelectedDamageSource', '선택된 피해')}: ${escapeHtml(getSelectedComponentLabel(damageData))}</div>`
    : '';

  return `
    <div class="chat-card item-card">
      <header class="card-header flexrow">
        <img src="${escapeHtml(damageData.itemImg)}" title="${escapeHtml(damageData.itemName)}" width="24" height="24"/>
        <h4 class="item-name" style="font-size: 1em; margin: 0;">${escapeHtml(damageData.itemName)} - ${escapeHtml(damageData.modeLabel)} ${localize('RAVE.SheetLabels.Damage', '피해')}${critText}</h4>
      </header>
      ${componentsHtml}
      <div style="margin-top: 10px; padding: 8px; background: #f5f5f5; border-radius: 6px; border: 1px solid #ddd;">
        <div><strong>${localize('RAVE.SheetLabels.CurrentDamage', '현재 피해')}:</strong> ${damageData.totals.finalTotal}</div>
        <div><strong>${localize('RAVE.SheetLabels.DamageModifier', '피해 수정치')}:</strong> ${damageData.modifier.total}</div>
        ${damageData.isCritical ? `<div><strong>${localize('RAVE.SheetLabels.CriticalMultiplier', '치명타 배수')}:</strong> x${damageData.critMultiplier}</div>` : ''}
        ${selectedSummary}
      </div>
      ${removableDiceHtml}
      ${removedDiceHtml}
    </div>
  `;
}

function renderDamageComponent(component, comparison) {
  const badgeLabel = component.included
    ? localize('RAVE.SheetLabels.Applied', '적용됨')
    : localize('RAVE.SheetLabels.NotApplied', '미적용');
  const badgeColor = component.included ? '#1f6f43' : '#666';
  const showsComparisonHint = comparison && ['base', 'mode'].includes(component.id);
  const comparisonHint = showsComparisonHint
    ? ` <span style="font-size: 12px; color: #666;">(${comparison.behavior === 'highest' ? localize('RAVE.SheetLabels.KeepHighest', '높은 값 선택') : localize('RAVE.SheetLabels.KeepLowest', '낮은 값 선택')})</span>`
    : '';

  return `
    <section style="margin-top: 10px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
        <div>
          <strong>${escapeHtml(component.label)}</strong>${comparisonHint}
          <span style="font-size: 12px; color: #666; margin-left: 6px;">${escapeHtml(component.formula)}</span>
        </div>
        <span style="font-size: 12px; color: ${badgeColor}; font-weight: bold;">${badgeLabel}</span>
      </div>
      ${component.rendered}
    </section>
  `;
}

function getRemovableDamageDice(damageData) {
  return damageData.components.flatMap((component) => {
    if (!component.included || component.removable === false) return [];
    return (component.dice ?? [])
      .filter((die) => die.active)
      .map((die) => ({ component, die }));
  });
}

function getRemovedDamageDice(damageData) {
  return damageData.components.flatMap((component) => {
    return (component.dice ?? [])
      .filter((die) => !die.active)
      .map((die) => ({ component, die }));
  });
}

function getSelectedComponentLabel(damageData) {
  const component = damageData.components.find((entry) => entry.included);
  return component?.label ?? localize('RAVE.SheetLabels.BaseDamage', '기본 피해');
}

function findDamageDie(damageData, dieId) {
  for (const component of damageData.components) {
    const die = (component.dice ?? []).find((entry) => entry.id === dieId);
    if (die) return { component, die };
  }
  return null;
}

function getDamageModifier(actor, item) {
  if (actor.type === 'npc') {
    return actor.system.cr || 0;
  }

  const abilityKey = item.system.ability || 'str';
  return actor.system.abilities?.[abilityKey]?.value ?? 0;
}

function getModeFormula(mode) {
  if (mode === RAVE.damageModes.enhanced) return '1d12';
  if (mode === RAVE.damageModes.impaired) return '1d4';
  return null;
}

function getModeComparisonBehavior(mode) {
  if (mode === RAVE.damageModes.enhanced) return 'highest';
  if (mode === RAVE.damageModes.impaired) return 'lowest';
  return null;
}

function getModeComparisonLabel(mode) {
  if (mode === RAVE.damageModes.enhanced) {
    return localize('RAVE.SheetLabels.EnhancedDie', '강화 다이스');
  }
  if (mode === RAVE.damageModes.impaired) {
    return localize('RAVE.SheetLabels.ImpairedDie', '약화 다이스');
  }
  return localize('RAVE.SheetLabels.BaseDamage', '기본 피해');
}

function getModeLabel(mode) {
  if (mode === RAVE.damageModes.enhanced) {
    return localize('RAVE.SheetLabels.Enhanced', '강화됨');
  }
  if (mode === RAVE.damageModes.impaired) {
    return localize('RAVE.SheetLabels.Impaired', '약화됨');
  }
  return localize('RAVE.SheetLabels.Normal', '일반');
}

function localize(key, fallback) {
  const translated = game.i18n.localize(key);
  return translated === key ? fallback : translated;
}

function escapeHtml(value) {
  return foundry.utils.escapeHTML(String(value ?? ''));
}

/**
 * Create a macro from an item drop
 * @param {Object} data - The dropped data
 * @param {number} slot - The hotbar slot
 * @returns {Promise<boolean>}
 */
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

/**
 * Roll an item macro from the hotbar
 * @param {string} itemUuid - The UUID of the item to roll
 */
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