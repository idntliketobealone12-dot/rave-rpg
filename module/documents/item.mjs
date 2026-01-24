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
    // 1. 아이템 데이터 가져오기
    const item = this;
    const actor = this.actor;

    // 2. 무기가 아닌 경우: 단순히 채팅창에 아이템 설명을 띄우고 종료
    if (!item.system.isWeapon) {
      const content = await renderTemplate('systems/rave-rpg/templates/item/item-sheet.hbs', {
        item: item,
        system: item.system,
        descriptionOnly: true // 템플릿에서 설명을 보여주기 위한 플래그 (커스텀 필요시)
      });
      
      // 간단히 설명만 출력 (채팅 메시지 생성)
      ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        content: `
          <div class="rave-chat-card">
            <header class="card-header flexrow">
              <img src="${item.img}" title="${item.name}" width="36" height="36"/>
              <h3 class="item-name">${item.name}</h3>
            </header>
            <div class="card-content">
              ${item.system.description}
            </div>
          </div>
        `
      });
      return;
    }

    // 3. 무기인 경우: 공격/피해 굴림을 위한 Dialog 생성
    const abilityKey = item.system.ability || 'str';
    const abilityLabel = game.i18n.localize(CONFIG.RAVE.abilities[abilityKey]);
    
    // Dialog 내용 HTML
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
            <label><input type="radio" name="damageMode" value="enhanced"> ${game.i18n.localize("RAVE.SheetLabels.Enhanced")}</label>
            <label><input type="radio" name="damageMode" value="impaired"> ${game.i18n.localize("RAVE.SheetLabels.Impaired")}</label>
          </div>
        </div>
      </form>
    `;

    // Dialog 렌더링
    new Dialog({
      title: `${item.name}: 공격 및 피해`,
      content: content,
      buttons: {
        roll: {
          label: "굴리기",
          icon: '<i class="fas fa-dice-d20"></i>',
          callback: async (html) => {
            // 입력값 가져오기
            const attackMod = html.find('[name="attackModifier"]').val();
            const damageMode = html.find('[name="damageMode"]:checked').val();
            
            // --- 1. 공격 굴림 계산 ---
            // 공식: 1d20 + 능력치 + 수정치
            const abilityVal = actor.system.abilities[abilityKey].value;
            let attackFormula = `1d20 + ${abilityVal}`;
            if (attackMod && attackMod != 0) {
                attackFormula += ` + ${attackMod}`;
            }

            const attackRoll = new Roll(attackFormula, actor.getRollData());
            await attackRoll.evaluate();

            // --- 2. 피해 굴림 계산 ---
            // 공식: 아이템의 공식 사용
            let damageFormula = item.system.formula || "0";
            const damageRoll = new Roll(damageFormula, actor.getRollData());
            await damageRoll.evaluate();

            // --- 3. 채팅 메시지 구성 ---
            // 피해 유형에 따른 라벨 처리
            let damageLabel = game.i18n.localize("RAVE.SheetLabels.Normal");
            let flavorClass = "";
            if (damageMode === "enhanced") {
                damageLabel = game.i18n.localize("RAVE.SheetLabels.Enhanced");
                flavorClass = "color:green; font-weight:bold;";
            } else if (damageMode === "impaired") {
                damageLabel = game.i18n.localize("RAVE.SheetLabels.Impaired");
                flavorClass = "color:red;";
            }

            // HTML 메시지 생성
            const messageContent = `
              <div class="rave-roll-card">
                <header class="card-header flexrow" style="border-bottom: 2px solid #000; margin-bottom: 10px; align-items: center;">
                  <img src="${item.img}" width="36" height="36" style="border:none; margin-right: 10px;"/>
                  <h3 style="margin:0;">${item.name}</h3>
                </header>

                <div class="dice-roll">
                    <div class="dice-result">
                        <div class="dice-formula">${attackFormula}</div>
                        <div class="dice-tooltip" style="display: none;">
                            ${await attackRoll.getTooltip()}
                        </div>
                        <h4 class="dice-total" style="font-size: 1.5em; border: 1px solid #333; background: #eee; padding: 5px; text-align: center;">
                            공격: ${attackRoll.total}
                        </h4>
                    </div>
                </div>

                <hr>

                <div class="dice-roll">
                    <div class="dice-result">
                        <label style="${flavorClass}">${damageLabel} 피해</label>
                        <div class="dice-formula">${damageFormula}</div>
                         <div class="dice-tooltip" style="display: none;">
                            ${await damageRoll.getTooltip()}
                        </div>
                        <h4 class="dice-total" style="font-size: 1.5em; border: 1px solid #7a0000; color: #fff; background: #7a0000; padding: 5px; text-align: center;">
                            피해: ${damageRoll.total}
                        </h4>
                    </div>
                </div>
              </div>
            `;

            // 3D 주사위 굴리기 (두 롤 합쳐서 전송하지 않고, 하나만 사운드 재생하되 표시는 직접 HTML로)
            // Foundry VTT의 Roll.toMessage를 쓰지 않고 직접 ChatMessage를 만듭니다.
            // 하지만 3D 주사위(Dice So Nice)를 보려면 Roll 인스턴스가 필요하므로 아래 방식을 씁니다.
            
            // 공격 굴림만 대표로 system roll로 처리하고, 내용은 우리가 만든 HTML로 덮어씌웁니다.
            // 이렇게 하면 3D 주사위가 나옵니다.
            attackRoll.toMessage({
                speaker: ChatMessage.getSpeaker({ actor: actor }),
                content: messageContent,
                sound: CONFIG.sounds.dice
            });
            
            // Dice So Nice 호환을 위해 피해 굴림도 백그라운드에서 푸시 (선택사항)
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
