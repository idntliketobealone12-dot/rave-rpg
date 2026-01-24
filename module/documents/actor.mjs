/**
   * Prepare Character type specific data
   */
  _prepareCharacterData(actorData) {
    if (actorData.type !== 'character') return;

    const systemData = actorData.system;

    // 1. 능력치 수정치 처리 (RAVE는 수치가 곧 수정치)
    for (let [key, ability] of Object.entries(systemData.abilities)) {
      ability.mod = ability.value;
      // 라벨 추가 (다국어 지원)
      ability.label = game.i18n.localize(CONFIG.RAVE.abilities[key]) ?? key;
    }

    // 2. 파생 수치 계산
    // 물건 칸: 10 + 힘 수치
    if (systemData.attributes.slots) {
        systemData.attributes.slots.max = 10 + systemData.abilities.str.value;
    }
    
    // 방어 점수(AC): 10 + 재주 수치 (갑옷은 아이템 로직이 필요하지만 여기선 기본 계산만)
    if (systemData.attributes.ac) {
        systemData.attributes.ac.value = 10 + systemData.abilities.dex.value;
    }
  }
