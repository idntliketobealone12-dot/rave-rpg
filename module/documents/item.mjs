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
   * @param {boolean} [shiftKey]   The shift key was held on the click?
   */
  async roll() {
    const item = this;
    const actor = this.actor;

    // 1. 무기가 아닌 경우: 채팅창에 설명만 출력
    if (!item.system.isWeapon) {
      const description = await TextEditor.enrichHTML(item.system.description, { async: true });
      
      ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        content: `
          <div class="rave-chat-card">
            <header class="card-header flexrow" style="border-bottom: 2px solid #333; margin-bottom: 10px; align-items: center;">
              <img src="${item.img}" title="${item.name}" width="36" height="36" style="border:none; margin-right: 10px;"/>
              <h3 class="item-name" style="margin:0;">${item.name}</h3>
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
      title: `${item.name}: 공격 및 피해`,
      content: content,
      buttons: {
        roll: {
          label: "굴리기",
          icon: '<i class="fas fa-dice-d20"></i>',
          callback: async (html) => {
            const attackMod = html.find('[name="attackModifier"]').val();
            const damageMode = html.find('[name="damageMode"]:checked').val();
            
            // --- 1. 공격 굴림 (Attack Roll) ---
            const abilityVal = actor.system.abilities[abilityKey].value;
            let attackFormula = `1d20 + ${abilityVal}`;
            if (attackMod && attackMod != 0) {
                attackFormula += ` + ${attackMod}`;
            }

            const attackRoll = new Roll(attackFormula, actor.getRollData());
            await attackRoll.evaluate();

            // --- 2. 피해 굴림 (Damage Roll) ---
            // 수정됨: {기본주사위, 비교주사위}kh + 능력치
            let baseDamageStr = item.system.formula || "0";
            // 공식에 괄호를 쳐서 안전하게 만듦 (예: "1d6 + 1"일 경우 대비)
            // 하지만 비교 공식에서는 단일 항이 좋으므로 사용자 입력을 믿거나 괄호 처리
            
            let finalDamageFormula = "";

            if (damageMode === "enhanced") {
                // 강화: {기본공식, 1d12}kh + 능력치
                finalDamageFormula = `{ ${baseDamageStr}, 1d12 }kh + ${abilityVal}`;
            } else if (damageMode === "impaired") {
                // 약화: {기본공식, 1d4}kl + 능력치
                finalDamageFormula = `{ ${baseDamageStr}, 1d4 }kl + ${abilityVal}`;
            } else {
                // 일반: 기본공식 + 능력치
                finalDamageFormula = `${baseDamageStr} + ${abilityVal}`;
            }

            const damageRoll = new Roll(finalDamageFormula, actor.getRollData());
            await damageRoll.evaluate();

            // --- 3. 채팅 메시지 (Chat Message) ---
            const description = await TextEditor.enrichHTML(item.system.description, { async: true });

            let damageLabel = game.i18n.localize("RAVE.SheetLabels.Normal");
            let flavorClass = "";
            if (damageMode === "enhanced") {
                damageLabel = game.i18n.localize("RAVE.SheetLabels.Enhanced");
                flavorClass = "color:green; font-weight:bold;";
            } else if (damageMode === "impaired") {
                damageLabel = game.i18n.localize("RAVE.SheetLabels.Impaired");
                flavorClass = "color:red;";
            }

            const messageContent = `
              <div class="rave-roll-card">
                <header class="card-header flexrow" style="border-bottom: 2px solid #333; margin-bottom: 10px; align-items: center;">
                  <img src="${item.img}" width="36" height="36" style="border:none; margin-right: 10px;"/>
                  <h3 style="margin:0;">${item.name}</h3>
                </header>

                <div class="card-content" style="margin-bottom: 15px; font-size: 0.9em; color: #444; border-bottom: 1px dashed #ccc; padding-bottom: 10px;">
                    ${description}
                </div>

                <div class="dice-roll">
                    <div class="dice-result">
                        <label style="font-weight:bold;">${game.i18n.localize("RAVE.SheetLabels.RollAttack")}</label>
                        <div class="dice-formula">${attackFormula}</div>
                        <div class="dice-tooltip" style="display: none;">
                            ${await attackRoll.getTooltip()}
                        </div>
                        <h4 class="dice-total" style="font-size: 1.5em; border: 1px solid #333; background: #eee; padding: 5px; text-align: center;">
                            ${attackRoll.total}
                        </h4>
                    </div>
                </div>

                <hr>

                <div class="dice-roll">
                    <div class="dice-result">
                        <label style="${flavorClass}">${damageLabel} 피해</label>
                        <div class="dice-formula">${finalDamageFormula}</div>
                         <div class="dice-tooltip" style="display: none;">
                            ${await damageRoll.getTooltip()}
                        </div>
                        <h4 class="dice-total" style="font-size: 1.5em; border: 1px solid #7a0000; color: #fff; background: #7a0000; padding: 5px; text-align: center;">
                            ${damageRoll.total}
                        </h4>
                    </div>
                </div>
              </div>
            `;

            attackRoll.toMessage({
                speaker: ChatMessage.getSpeaker({ actor: actor }),
                content: messageContent,
                sound: CONFIG.sounds.dice
            });

            if (game.modules.get("dice-so-nice")?.active) {
                game.dice3d.showForRoll(damageRoll, game.user, true);
            }
          }
        }
      },
      default: "roll"
    }).render(true);
  }
}
