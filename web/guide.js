// 내 자리에서 고른 부스까지의 안내 (CES 공식 앱의 "길 안내"에 맞춘 것).
// 같은 홀이면 부스 번호가 어느 쪽인지, 같은 캠퍼스의 다른 곳이면 어느 건물로, 다른 캠퍼스면 구글맵 길찾기.
// 부스 자리와 통로는 부스 번호로 짐작한 것이다. 화면과 따로 두어 Node에서도 시험한다.

const numberOf = (code) => { const m = /^(\d+)[a-zA-Z]?$/.exec(code || ''); return m ? parseInt(m[1], 10) : null; };

// where: 내 자리({ by, place?, code?, campus?, area? }) · target: { place, code } · placeOf(k): { ko, c }
// 돌려주는 것: { kind, lines: [글…], maps: 구글맵 길찾기가 필요한가 }
export function guideTo(where, target, placeOf) {
  const to = placeOf(target.place);
  const toName = to ? to.ko : '장소 모름';
  if (!where) {
    return { kind: 'unknown', maps: true, lines: [`내 자리를 모른다. 가까운 부스 번호를 넣으면 여기서부터의 안내가 나온다.`, `${toName}까지는 구글맵 길찾기로 간다.`] };
  }
  const myPlaces = where.by === 'booth' ? [where.place] : (where.area?.places || []);
  const myCampus = where.campus || null;
  const guessed = where.by !== 'booth';
  if (myPlaces.includes(target.place)) {
    const lines = [`같은 곳에 있다: ${toName}${guessed ? ' (내 자리는 GPS로 본 짐작)' : ''}.`];
    const a = where.by === 'booth' ? numberOf(where.code) : null, b = numberOf(target.code);
    if (a != null && b != null) {
      const aisleA = Math.floor(a / 100), aisleB = Math.floor(b / 100);
      if (aisleA === aisleB) lines.push(`같은 통로다(${aisleB}번대). 부스 번호가 ${b > a ? '커지는' : '작아지는'} 쪽으로 ${a} → ${b}.`);
      else lines.push(`부스 번호가 ${b > a ? '커지는' : '작아지는'} 쪽으로 간다: ${aisleA}번대 통로 → ${aisleB}번대 통로 (통로 ${Math.abs(aisleB - aisleA)}개쯤). 찾을 부스: ${target.code}.`);
    } else {
      lines.push(`찾을 부스: ${target.code}. 지도에 그은 줄을 따라간다.`);
    }
    lines.push('통로와 자리는 부스 번호로 짐작한 것이다. 홀 안의 안내판을 같이 본다.');
    return { kind: 'same-place', maps: false, lines };
  }
  if (to && myCampus && to.c === myCampus) {
    const from = myPlaces.map((k) => placeOf(k)?.ko).filter(Boolean)[0];
    return { kind: 'same-campus', maps: true, lines: [`같은 캠퍼스의 다른 곳이다: ${from ? `${from} → ` : ''}${toName}.`, '지도에 그은 줄 쪽으로 걸어가거나, 구글맵 길찾기를 쓴다.', `도착하면 찾을 부스: ${target.code}.`] };
  }
  return { kind: 'other-campus', maps: true, lines: [`다른 캠퍼스에 있다: ${toName}.`, '걸어가기에는 멀다. 구글맵 길찾기를 쓰거나 "셔틀"을 본다.', `도착하면 찾을 부스: ${target.code}.`] };
}
