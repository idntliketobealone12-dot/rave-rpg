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
  const isCritical = button.dataset.crit === 'true';

  const actor = game.actors.get(actorId);
  if (!actor) return;

  const item = actor.items.get(itemId);
  if (!item) return;

  const options = await promptForDamageOptions(item);
  if (!options) return;

  try {
    const { damageData, rolls } = await buildDamageMessageData({
      actor,
      item,
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

async function promptForDamageOptions(item) {
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
          <select name="damageMode" style="width: 100%; box-sizing: border-box;">
            <option value="${RAVE.damageModes.normal}">${localize('RAVE.SheetLabels.Normal', '일반')}</option>
            <option value="${RAVE.damageModes.enhanced}">${localize('RAVE.SheetLabels.Enhanced', '강화됨')}</option>
            <option value="${RAVE.damageModes.impaired}">${localize('RAVE.SheetLabels.Impaired', '약화됨')}</option>
          </select>
        </div>
        <div class="form-group" style="margin-top: 10px;">
          <label style="font-weight: bold; display: block; margin-bottom: 4px;">${localize('RAVE.SheetLabels.ExtraDieType', '추가 다이스')}</label>
          <select name="extraDieType" style="width: 100%; box-sizing: border-box;">
            <option value="">${localize('RAVE.SheetLabels.NoExtraDie', '없음')}</option>
            <option value="d4">d4</option>
            <option value="d6">d6</option>
            <option value="d8">d8</option>
            <option value="d10">d10</option>
            <option value="d12">d12</option>
          </select>
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
            const mode = String(html.find('[name="damageMode"]').val() ?? RAVE.damageModes.normal);
            const extraDieType = String(html.find('[name="extraDieType"]').val() ?? '').trim();
            const extraFlatModifier = Number(html.find('[name="extraFlatModifier"]').val() || 0);

            complete({
              mode,
              extraDieType,
              extraDiceFormula: extraDieType ? `1${extraDieType}` : '',
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

async function buildDamageMessageData({ actor, item, isCritical, options }) {
  const mode = options.mode || RAVE.damageModes.normal;
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
    poolParticipant: true,
  });
  components.push(baseRollResult.component);
  rolls.push(baseRollResult.roll);

  if (options.extraDiceFormula) {
    const extraRollResult = await evaluateDamageComponent({
      actor,
      formula: options.extraDiceFormula,
      id: 'extra',
      label: localize('RAVE.SheetLabels.ExtraDamage', '추가 피해'),
      highestDieOnly: true,
      poolParticipant: true,
    });
    components.push(extraRollResult.component);
    rolls.push(extraRollResult.roll);
  }

  if (modeFormula && comparisonBehavior) {
    const modeRollResult = await evaluateDamageComponent({
      actor,
      formula: modeFormula,
      id: 'mode',
      label: getModeComparisonLabel(mode),
      comparisonParticipant: true,
    });
    components.push(modeRollResult.component);
    rolls.push(modeRollResult.roll);
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
    comparison: comparisonBehavior
      ? {
          behavior: comparisonBehavior,
          selectedComponentId: 'pool',
        }
      : null,
    modifier: {
      base: modifierValue,
      extra: Number(options.extraFlatModifier) || 0,
      total: modifierValue + (Number(options.extraFlatModifier) || 0),
    },
  };

  calculateDamageTotals(damageData);
  return { damageData, rolls };
}

async function evaluateDamageComponent({ actor, formula, id, label, highestDieOnly = false, poolParticipant = false, comparisonParticipant = false }) {
  const roll = new Roll(formula, actor.getRollData());
  await roll.evaluate();

  const rendered = await roll.render();
  const dice = extractDamageDice(roll, id, { highestDieOnly });
  const allDiceTotal = dice.reduce((sum, die) => sum + die.result, 0);
  const diceTotal = dice
    .filter((die) => die.active)
    .reduce((sum, die) => sum + die.result, 0);
  const total = Number(roll.total) || 0;
  const staticTotal = total - allDiceTotal;

  return {
    roll,
    component: {
      id,
      label,
      formula,
      rendered,
      total,
      staticTotal,
      included: true,
      removable: true,
      poolParticipant,
      comparisonParticipant,
      dice,
    },
  };
}

function extractDamageDice(roll, componentId, { highestDieOnly = false } = {}) {
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

  if (highestDieOnly && dice.length > 1) {
    let highestIndex = 0;
    for (let index = 1; index < dice.length; index += 1) {
      if (dice[index].result > dice[highestIndex].result) {
        highestIndex = index;
      }
    }

    for (let index = 0; index < dice.length; index += 1) {
      dice[index].active = index === highestIndex;
    }
  }

  return dice;
}

function calculateDamageTotals(damageData) {
  const poolComponents = damageData.components.filter((component) => component.poolParticipant);
  const comparisonComponent = damageData.components.find((component) => component.comparisonParticipant);

  const pooledDice = poolComponents.flatMap((component) => {
    return (component.dice ?? [])
      .filter((die) => die.active)
      .map((die) => ({ componentId: component.id, dieId: die.id, result: die.result }));
  });

  let selectedPoolDieId = null;
  if (pooledDice.length) {
    selectedPoolDieId = pooledDice[0].dieId;
    for (const entry of pooledDice.slice(1)) {
      const currentSelected = pooledDice.find((die) => die.dieId === selectedPoolDieId);
      if (entry.result > currentSelected.result) {
        selectedPoolDieId = entry.dieId;
      }
    }
  }

  let pooledComponentTotal = 0;
  let comparisonComponentTotal = 0;

  for (const component of damageData.components) {
    const activeDice = (component.dice ?? []).filter((die) => die.active);
    const activeDiceTotal = activeDice.reduce((sum, die) => sum + die.result, 0);
    const appliedDiceTotal = component.poolParticipant
      ? activeDice
        .filter((die) => die.id === selectedPoolDieId)
        .reduce((sum, die) => sum + die.result, 0)
      : activeDiceTotal;

    component.activeDiceTotal = activeDiceTotal;
    component.appliedDiceTotal = appliedDiceTotal;
    component.poolTotal = component.staticTotal + appliedDiceTotal;
    component.modeTotal = component.staticTotal + activeDiceTotal;

    for (const die of component.dice ?? []) {
      die.applied = false;
    }

    if (component.poolParticipant) {
      pooledComponentTotal += component.poolTotal;
    } else if (component.comparisonParticipant) {
      comparisonComponentTotal += component.modeTotal;
    }
  }

  const modifierTotal = Number(damageData.modifier?.total) || 0;
  const pooledCandidateTotal = pooledComponentTotal + modifierTotal;
  const comparisonCandidateTotal = comparisonComponentTotal + modifierTotal;

  let selectedComponentId = 'pool';
  if (damageData.comparison && comparisonComponent) {
    const chooseComparison = damageData.comparison.behavior === 'highest'
      ? comparisonCandidateTotal > pooledCandidateTotal
      : comparisonCandidateTotal < pooledCandidateTotal;
    selectedComponentId = chooseComparison ? comparisonComponent.id : 'pool';
    damageData.comparison.selectedComponentId = selectedComponentId;
  }

  let componentTotal = 0;
  for (const component of damageData.components) {
    if (component.poolParticipant) {
      component.included = selectedComponentId === 'pool';
      component.currentTotal = component.included ? component.poolTotal : 0;
      if (component.included) {
        for (const die of component.dice ?? []) {
          die.applied = die.active && die.id === selectedPoolDieId;
        }
      }
    } else if (component.comparisonParticipant) {
      component.included = selectedComponentId === component.id;
      component.currentTotal = component.included ? component.modeTotal : 0;
      if (component.included) {
        for (const die of component.dice ?? []) {
          die.applied = die.active;
        }
      }
    } else {
      component.included = true;
      component.currentTotal = component.staticTotal + component.activeDiceTotal;
      for (const die of component.dice ?? []) {
        die.applied = die.active;
      }
    }

    componentTotal += component.currentTotal;
  }

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
      <div style="margin-top: 10px; padding: 8px; background: #f5f5f5; border-radius: 6px; border: 1px solid #ddd; color: #111;">
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
  const showsComparisonHint = comparison && (component.poolParticipant || component.comparisonParticipant);
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
      .filter((die) => die.active && die.applied)
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
  if (damageData.comparison?.selectedComponentId === 'pool') {
    return getPooledComponentLabel(damageData);
  }

  const component = damageData.components.find((entry) => entry.id === damageData.comparison?.selectedComponentId)
    ?? damageData.components.find((entry) => entry.included);
  return component?.label ?? localize('RAVE.SheetLabels.BaseDamage', '기본 피해');
}

function getPooledComponentLabel(damageData) {
  const labels = damageData.components
    .filter((component) => component.poolParticipant)
    .map((component) => component.label);

  return labels.join(' + ') || localize('RAVE.SheetLabels.BaseDamage', '기본 피해');
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