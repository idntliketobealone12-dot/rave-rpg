export class raveItem extends Item {
  prepareData() {
    super.prepareData();
  }

  async roll() {
    const item = this;
    const actor = this.actor;

    // 1. 주문 타입 처리
    if (item.system?.itemType === 'spell') {
      const spellLevel = item.system.spellLevel || 0;
      const dc = 10 + spellLevel;
      
      const content = `
        <form>
          <div class="form-group">
            <label style="font-weight:bold;">주문 레벨</label>
            <input type="text" name="spellLevel" value="${spellLevel}" data-dtype="Number" style="width: 100%; box-sizing: border-box;"/>
          </div>
          <div class="form-group" style="margin-top: 10px;">
            <label style="font-weight:bold;">난이도 (자동 계산: 10 + 주문 레벨)</label>
            <input type="text" name="dc" value="${dc}" data-dtype="Number" disabled style="width: 100%; box-sizing: border-box; background-color: #e0e0e0;"/>
          </div>
        </form>
      `;

      new Dialog({
        title: `${item.name} - 주문 판정`,
        content: content,
        buttons: {
          roll: {
            label: "굴리기",
            icon: '<i class="fas fa-dice-d20"></i>',
            callback: async (html) => {
              const inputSpellLevel = parseInt(html.find('[name="spellLevel"]').val()) || 0;
              const finalDc = 10 + inputSpellLevel;
              
              // 의지 능력치로 판정
              const wilVal = actor.system.abilities.wil.value;
              const rollFormula = `1d20 + ${wilVal}`;
              const roll = new Roll(rollFormula, actor.getRollData());
              await roll.evaluate();
              
              const total = roll.total;
              const success = total >= finalDc;
              const successText = success ? game.i18n.localize("RAVE.SheetLabels.Success") : game.i18n.localize("RAVE.SheetLabels.Failure");
              const successStyle = success ? 'color: green; font-weight: bold;' : 'color: red; font-weight: bold;';
              
              const description = await TextEditor.enrichHTML(item.system.description, { async: true });
              const rollHTML = await roll.render();
              
              const messageContent = `
                <div class="chat-card item-card">
                    <header class="card-header flexrow">
                        <img src="${item.img}" title="${item.name}" width="24" height="24"/>
                        <h4 class="item-name" style="font-size: 1em; margin: 0;">${item.name}</h4>
                    </header>
                    
                    <div class="card-content">
                        ${description}
                    </div>

                    <div style="margin-top: 10px; font-weight: bold;">
                        주문 판정 (의지 능력치)
                    </div>
                    <div style="margin-bottom: 10px;">
                        난이도: ${finalDc}
                    </div>
                    ${rollHTML}
                    
                    <div style="margin-top: 10px; padding: 8px; background-color: #f5f5f5; border-radius: 4px;">
                        <span style="${successStyle}">${successText}</span>
                    </div>
                </div>
              `;

              ChatMessage.create({
                user: game.user.id,
                speaker: ChatMessage.getSpeaker({ actor: actor }),
                content: messageContent,
                type: CONST.CHAT_MESSAGE_TYPES.ROLL,
                rolls: [roll],
                sound: CONFIG.sounds.dice
              });
            }
          }
        },
        default: "roll"
      }).render(true);
      return;
    }

    // 2. 무기가 아닌 경우: 채팅창에 설명 출력
    // 'weapon' 타입이 아닐 때는 모두 일반 아이템으로 취급
    if (item.system?.itemType !== 'weapon') {
      const description = await TextEditor.enrichHTML(item.system.description, { async: true });
      ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        content: `
            <div class="chat-card item-card">
                <header class="card-header flexrow">
                    <img src="${item.img}" title="${item.name}" width="24" height="24"/>
                    <h4 class="item-name" style="font-size: 1em; margin: 0;">${item.name}</h4>
                </header>
                <div class="card-content">
                    ${description}
                </div>
            </div>
        `
      });
      return;
    }

    // 3. 무기인 경우 ('weapon' 타입): 공격 굴림 (수정치 입력 다이얼로그)
    let abilityKey, abilityVal, baseModifier;
    
    if (actor.type === 'npc') {
      // NPC: 레벨(CR) 사용
      baseModifier = actor.system.cr || 0;
    } else {
      // 캐릭터: 능력치 사용
      abilityKey = item.system.ability || 'str';
      baseModifier = actor.system.abilities[abilityKey].value;
    }
    
    // 수정치 입력 다이얼로그
    let modifierInput = 0;
    await new Promise(resolve => {
      const dialogContent = `<div style="text-align: center;">
        <label style="display: block; margin-bottom: 10px;">추가 수정치:</label>
        <input type="number" id="modifier-input" value="0" style="width: 60px; padding: 4px; text-align: center;" />
      </div>`;
      
      new Dialog({
        title: `${item.name} - 공격 굴림`,
        content: dialogContent,
        buttons: {
          roll: {
            label: "굴림",
            callback: (html) => {
              const input = html.find('#modifier-input').val();
              modifierInput = parseInt(input) || 0;
              resolve();
            }
          },
          cancel: {
            label: "취소",
            callback: () => {
              modifierInput = null;
              resolve();
            }
          }
        },
        default: "roll"
      }).render(true);
    });
    
    if (modifierInput === null) return;
    
    const totalModifier = baseModifier + modifierInput;
    const attackFormula = `1d20 + ${totalModifier}`;
    
    const attackRoll = new Roll(attackFormula, actor.getRollData());
    await attackRoll.evaluate();
    
    const d20Result = attackRoll.terms[0].results[0].result;
    const isCritical = d20Result === 20;
    
    const description = await TextEditor.enrichHTML(item.system.description, { async: true });
    const attackRollHTML = await attackRoll.render();
    
    const criticalText = isCritical ? `<div style="margin-top: 10px; padding: 8px; background-color: #ffd700; color: #000; font-weight: bold; text-align: center; border-radius: 4px;">${game.i18n.localize("RAVE.SheetLabels.Critical")}</div>` : '';
    
    const messageContent = `
        <div class="chat-card item-card">
            <header class="card-header flexrow">
                <img src="${item.img}" title="${item.name}" width="24" height="24"/>
                <h4 class="item-name" style="font-size: 1em; margin: 0;">${item.name}</h4>
            </header>
            
            <div class="card-content">
                ${description}
            </div>

            <div style="margin-top: 10px; font-weight: bold;">
                ${game.i18n.localize("RAVE.SheetLabels.RollAttack")}
            </div>
            ${attackRollHTML}
            ${criticalText}
            
            <div style="margin-top: 10px; display: flex; flex-direction: column; gap: 5px;">
                <button class="damage-button" data-item-id="${item.id}" data-actor-id="${actor.id}" data-mode="normal" data-crit="${isCritical}" style="padding: 5px; cursor: pointer;">
                    ${game.i18n.localize("RAVE.SheetLabels.RollNormalDamage")}
                </button>
                <button class="damage-button" data-item-id="${item.id}" data-actor-id="${actor.id}" data-mode="enhanced" data-crit="${isCritical}" style="padding: 5px; cursor: pointer;">
                    ${game.i18n.localize("RAVE.SheetLabels.RollEnhancedDamage")}
                </button>
                <button class="damage-button" data-item-id="${item.id}" data-actor-id="${actor.id}" data-mode="impaired" data-crit="${isCritical}" style="padding: 5px; cursor: pointer;">
                    ${game.i18n.localize("RAVE.SheetLabels.RollImpairedDamage")}
                </button>
            </div>
        </div>
    `;

    ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        content: messageContent,
        type: CONST.CHAT_MESSAGE_TYPES.ROLL,
        rolls: [attackRoll],
        sound: CONFIG.sounds.dice
    });
  }
}