/**
 * Extend the base Actor document by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Actor}
 */
export class raveActor extends Actor {
  /** @override */
  prepareData() {
    super.prepareData();
  }

  /** @override */
  prepareBaseData() {
    // Data modifications in this step occur before processing embedded documents or derived data.
  }

  /** @override */
  prepareDerivedData() {
    const actorData = this;
    // Make separate methods for each Actor type (character, npc, etc.) to keep things organized.
    this._prepareCharacterData(actorData);
    this._prepareNpcData(actorData);
  }

  /**
   * Prepare Character type specific data
   */
  _prepareCharacterData(actorData) {
    if (actorData.type !== 'character') return;

    const systemData = actorData.system;

    // 1. 능력치 수정치 처리 (RAVE: 수치 = 수정치)
    for (let [key, ability] of Object.entries(systemData.abilities)) {
      ability.mod = ability.value;
      ability.label = game.i18n.localize(CONFIG.RAVE.abilities[key]) ?? key;
    }

    // 2. 소지품 무게(물건 칸) 자동 계산
    let totalSlots = 0;
    // this.items는 액터가 소유한 아이템 컬렉션입니다.
    for (const item of this.items) {
      // 아이템 데이터 구조에서 weight와 quantity를 가져옵니다. (없으면 0 또는 1로 취급)
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
    
    // 방어 점수(AC): 10 + 재주 (기본)
    if (systemData.attributes.ac) {
        systemData.attributes.ac.value = 10 + (systemData.abilities.dex?.value || 0);
    }
  }

  /**
   * Prepare NPC type specific data.
   */
  _prepareNpcData(actorData) {
    if (actorData.type !== 'npc') return;
    const systemData = actorData.system;
    systemData.xp = systemData.cr * systemData.cr * 100; // 예시 XP 계산식
  }

  /**
   * Override getRollData() that's supplied to rolls.
   */
  getRollData() {
    const data = { ...super.getRollData() };
    this._getCharacterRollData(data);
    this._getNpcRollData(data);
    return data;
  }

  /**
   * Prepare character roll data.
   */
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

  /**
   * Prepare NPC roll data.
   */
  _getNpcRollData(data) {
    if (this.type !== 'npc') return;
  }
}
