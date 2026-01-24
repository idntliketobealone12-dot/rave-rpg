/**
   * Prepare Character type specific data
   */
  _prepareCharacterData(actorData) {
    if (actorData.type !== 'character') return;

    const systemData = actorData.system;

    // 1. 능력치 수정치 처리
    for (let [key, ability] of Object.entries(systemData.abilities)) {
      ability.mod = ability.value;
      ability.label = game.i18n.localize(CONFIG.RAVE.abilities[key]) ?? key;
    }

    // 2. 소지품 무게(물건 칸) 자동 계산
    let totalSlots = 0;
    for (const item of this.items) {
      const weight = item.system.weight || 0;
      const quantity = item.system.quantity || 1; 
      totalSlots += weight * quantity;
    }

    // 3. 파생 수치 적용
    
    // 물건 칸: 현재 사용량(value)과 최대치(max = 10 + 힘)
    if (systemData.attributes.slots) {
        systemData.attributes.slots.value = totalSlots;
        systemData.attributes.slots.max = 10 + (systemData.abilities.str?.value || 0);
    }
    
    // [추가됨] 부상(Wounds): 최대치는 물건 칸 최대치와 동일 (10 + 힘)
    if (systemData.attributes.wounds) {
        systemData.attributes.wounds.max = 10 + (systemData.abilities.str?.value || 0);
    }

    // 방어 점수(AC): 10 + 재주 (기본)
    if (systemData.attributes.ac) {
        systemData.attributes.ac.value = 10 + (systemData.abilities.dex?.value || 0);
    }
  }
