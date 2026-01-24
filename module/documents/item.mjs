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

    // 1. 무기가 아닌 경우
    if (!item.system.isWeapon) {
      const description = await TextEditor.enrichHTML(item.system.description, { async: true });
      ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        content: `
          <div class="rave-roll-card">
            <header class="card-header">
              <img src="${item.img}" width="30" height="30"/>
              <h3 class="item-name">${item.name}</h3>
            </header>
            <div class="card-content" style="border:none;">
              ${description}
            </div>
          </div>
        `
      });
      return;
    }

    // 2. 무기인 경우 Dialog
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
            let damageClass = ""; // CSS 클래스

            if (damageMode === "enhanced") {
                finalDamageFormula = `{ ${baseDamageStr}, 1d12 }kh + ${abilityVal}`;
                damageClass = "enhanced";
            } else if (damageMode === "impaired") {
                finalDamageFormula = `{ ${baseDamageStr}, 1d4 }kl + ${abilityVal}`;
                damageClass = "impaired";
            } else {
                finalDamageFormula = `${baseDamageStr} + ${abilityVal}`;
            }
            const damageRoll = new Roll(finalDamageFormula, actor.getRollData());
            await damageRoll.evaluate();

            // --- 3. 채팅 메시지 ---
            const description = await TextEditor.enrichHTML(item.system.description, { async: true });
            
            // 라벨 텍스트
            let damageLabelText = game.i18n.localize("RAVE.SheetLabels.Normal");
            if (damageMode === "enhanced") damageLabelText = game.i18n.localize("RAVE.SheetLabels.Enhanced");
            if (damageMode === "impaired") damageLabelText = game.i18n.localize("RAVE.SheetLabels.Impaired");

            // 툴팁 HTML 가져오기 (비동기)
            const attackTooltip = await attackRoll.getTooltip();
            const damageTooltip = await damageRoll.getTooltip();

            const messageContent = `
              <div class="rave-roll-card">
                <header class="card-header">
                  <img src="${item.img}" width="30" height="30"/>
                  <h3 class="item-name">${item.name}</h3>
                </header>

                <div class="card-content">
                    ${description}
                </div>

                <div class="dice-roll">
                    <div class="dice-result">
                        <div class="roll-label">${game.i18n.localize("RAVE.SheetLabels.RollAttack")}</div>
                        <div class="dice-tooltip">${attackTooltip}</div>
                        <h4 class="dice-total">${attackRoll.total}</h4>
                    </div>
                </div>

                <div class="dice-roll">
                    <div class="dice-result">
                        <div class="roll-label ${damageClass}">${damageLabelText} 피해</div>
                        <div class="dice-tooltip">${damageTooltip}</div>
                        <h4 class="dice-total damage">${damageRoll.total}</h4>
                    </div>
                </div>
              </div>
            `;

            // 메시지 전송
            // type: CONST.CHAT_MESSAGE_TYPES.ROLL 을 사용하여 Foundry가 주사위로 인식하게 함
            ChatMessage.create({
                user: game.user.id,
                speaker: ChatMessage.getSpeaker({ actor: actor }),
                content: messageContent,
                type: CONST.CHAT_MESSAGE_TYPES.ROLL,
                rolls: [attackRoll, damageRoll], // 3D 주사위 연동 및 데이터 보존
                sound: CONFIG.sounds.dice
            });
          }
        }
      },
      default: "roll"
    }).render(true);
  }
}
