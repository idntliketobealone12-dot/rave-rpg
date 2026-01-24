export class raveActor extends Actor {

  prepareData() {
    super.prepareData();
  }

  prepareBaseData() {}

  prepareDerivedData() {
    const actorData = this;
    this._prepareCharacterData(actorData);
    this._prepareNpcData(actorData);
  }

  _prepareCharacterData(actorData) {
    if (actorData.type !== 'character') return;

    const systemData = actorData.system;

    // 1. 능력치 수정치 (값 = 수정치)
    for (let [key, ability] of Object.entries(systemData.abilities)) {
      ability.mod = ability.value;
      ability.label = game.i18n.localize(CONFIG.RAVE.abilities[key]) ?? key;
    }

    // 2. 소지품 무게 합산 및 장착 방어구 처리
    let totalSlots = 0;
    let acBonus = 0;
    let maxMainArmorBonus = 0;
    let hasCumbersome = false;
    
    for (const item of this.items) {
      const weight = item.system.weight || 0;
      const quantity = item.system.quantity || 1;
      
      // 방어구 처리
      if (item.type === 'item' && item.system.itemType === 'armor') {
        const armorBonus = item.system.acBonus || 0;
        
        // 부속 방어구는 모두 더하기
        if (item.system.isAccessory) {
          acBonus += armorBonus;
        } else {
          // 부속이 아닌 방어구는 가장 높은 것만 선택
          maxMainArmorBonus = Math.max(maxMainArmorBonus, armorBonus);
        }
        
        // 불편한 방어구 체크
        if (item.system.isCumbersome) {
          hasCumbersome = true;
        }
        
        totalSlots += weight;
      } else {
        // 일반 아이템
        totalSlots += weight * quantity;
      }
    }

    // 부속이 아닌 방어구 중 최고 보너스 더하기
    acBonus += maxMainArmorBonus;

    // 3. 파생 수치 계산
    const strVal = systemData.abilities.str?.value || 0;
    const dexVal = systemData.abilities.dex?.value || 0;

    // 물건 칸: 현재값 = 아이템 합계, 최대값 = 10 + 힘
    if (systemData.attributes.slots) {
        systemData.attributes.slots.value = totalSlots;
        systemData.attributes.slots.max = 10 + strVal;
    }
    
    // 부상(Wounds): 최대값 = 10 + 힘
    if (systemData.attributes.wounds) {
        systemData.attributes.wounds.max = 10 + strVal;
    }

    // 방어 점수(AC): 10 + 방어구 보너스 + (불편함 없으면 재주)
    if (systemData.attributes.ac) {
      let finalAC = 10 + acBonus;
      
      // 불편한 갑옷이 없으면 재주 보너스 추가
      if (!hasCumbersome) {
        finalAC += dexVal;
      }
      
      systemData.attributes.ac.value = finalAC;
    }
  }

  _prepareNpcData(actorData) {
    if (actorData.type !== 'npc') return;
  }

  getRollData() {
    const data = { ...super.getRollData() };
    this._getCharacterRollData(data);
    return data;
  }

  _getCharacterRollData(data) {
    if (this.type !== 'character') return;
    if (data.abilities) {
      for (let [k, v] of Object.entries(data.abilities)) {
        data[k] = foundry.utils.deepClone(v);
      }
    }
    if (data.attributes.level) {
      data.lvl = data.attributes.level.value ?? 0;
    }
  }
}
