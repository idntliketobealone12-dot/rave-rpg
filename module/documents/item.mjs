/**
 * Extend the basic Item with some very simple modifications.
 * @extends {Item}
 */
export class raveItem extends Item {
  /**
   * Augment the basic Item data model with additional dynamic data.
   */
  prepareData() {
    super.prepareData();
  }

  /**
   * Handle clickable rolls.
   */
  async roll() {
    const item = this;
    const actor = this.actor;

    // 1. 무기가 아닌 경우: 채팅창에 설명 출력
    if (!item.system.isWeapon) {
      const description = await TextEditor.enrichHTML(item.system.description, { async: true });
      ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        content: `
            <div class="chat-card item-card">
                <header class="card-header flexrow">
                    <img src="${item.img}" title="${item.name}" width="36" height="36"/>
                    <h3 class="item-name">${item.name}</h3>
                </header>
                <div class="card-content">
                    ${description}
                </div>
            </div>
        `
      });
      return;
    }

    // 2. 무기인 경우: Dialog 생성
    const abilityKey = item.system.ability || 'str';
    const abilityLabel = game.i18n.localize(CONFIG.RAVE.abilities[abilityKey]);
    
    const content = `
      <form>
        <div class="form-group">
          <label style="font-weight:bold;">${game.i18n.localize("RAVE.SheetLabels.AttackAbility")}: ${abilityLabel}</label>
        </div>
        <div class="form-group">
          <label>${game.i18n.localize("RAVE.SheetLabels.RollAttack")} 수정치</label>
          <input type="text" name="attackModifier" value="0" placeholder="+1, -2"/>
        </div>
        <div class="form-group">
          <label style="font-weight:bold; display:block; margin-top:10px;">${game.i18n.localize("RAVE.SheetLabels.DamageType")}</label>
          <div style="display:flex; flex-direction:column; gap:5px;">
            <label><input type="radio" name="damageMode" value="normal" checked> ${game.i18n.localize("RAVE.SheetLabels.Normal")}</label>
            <label><input type="radio" name="damageMode" value="enhanced"> ${game.i18n.localize("RAVE.SheetLabels.Enhanced")} (d12)</label>
            <label><input type="radio" name="damageMode" value="impaired"> ${game.i18n.localize("RAVE.SheetLabels.Impaired")} (d4)</label>
          </div>
        </div>
      </form>
    `;

    new Dialog({
      title: `${item.name}`,
      content: content,
      buttons: {
        roll: {
          label: "굴리기",
          icon: '<i class="fas fa-dice-d20"></i>',
          callback: async (html) => {
            const attackMod = html.find('[name="attackModifier"]').val();
            const damageMode = html.find('[name="damageMode"]:checked').val();
            
            // --- 1. 공격 굴림 ---
            const abilityVal = actor.system.abilities[abilityKey].value;
            let attackFormula = `1d20 + ${abilityVal}`;
            if (attackMod && attackMod != 0) {
                attackFormula += ` + ${attackMod}`;
            }
            const attackRoll = new Roll(attackFormula, actor.getRollData());
            await attackRoll.evaluate();

            // --- 2. 피해 굴림 ---
            let baseDamageStr = item.system.formula || "0";
            let finalDamageFormula = "";

            if (damageMode === "enhanced") {
                finalDamageFormula = `{ ${baseDamageStr}, 1d12 }kh + ${abilityVal}`;
            } else if (damageMode === "impaired") {
                finalDamageFormula = `{ ${baseDamageStr}, 1d4 }kl + ${abilityVal}`;
            } else {
                finalDamageFormula = `${baseDamageStr} + ${abilityVal}`;
            }
            const damageRoll = new Roll(finalDamageFormula, actor.getRollData());
            await damageRoll.evaluate();

            // --- 3. 채팅 메시지 전송 ---
            const description = await TextEditor.enrichHTML(item.system.description, { async: true });
            
            let damageLabelText = game.i18n.localize("RAVE.SheetLabels.Normal");
            if (damageMode === "enhanced") damageLabelText = game.i18n.localize("RAVE.SheetLabels.Enhanced");
            if (damageMode === "impaired") damageLabelText = game.i18n.localize("RAVE.SheetLabels.Impaired");

            // [핵심] Foundry 기본 렌더링 사용 (기교 X)
            const attackRollHTML = await attackRoll.render();
            const damageRollHTML = await damageRoll.render();

            const messageContent = `
                <div class="chat-card item-card">
                    <header class="card-header flexrow">
                        <img src="${item.img}" title="${item.name}" width="36" height="36"/>
                        <h3 class="item-name">${item.name}</h3>
                    </header>
                    
                    <div class="card-content">
                        ${description}
                    </div>

                    <div style="margin-top: 10px; font-weight: bold;">
                        ${game.i18n.localize("RAVE.SheetLabels.RollAttack")}
                    </div>
                    ${attackRollHTML}

                    <div style="margin-top: 10px; font-weight: bold;">
                        ${damageLabelText} 피해
                    </div>
                    ${damageRollHTML}
                </div>
            `;

            ChatMessage.create({
                user: game.user.id,
                speaker: ChatMessage.getSpeaker({ actor: actor }),
                content: messageContent,
                type: CONST.CHAT_MESSAGE_TYPES.ROLL,
                rolls: [attackRoll, damageRoll],
                sound: CONFIG.sounds.dice
            });
          }
        }
      },
      default: "roll"
    }).render(true);
  }
}
