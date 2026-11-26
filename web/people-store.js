// 만난 사람을 폰에만 남긴다 (ces2027.people.v1). 일기 보내기 묶음에는 들어가지 않는다.
// 목표 숫자(ces2027.goal.v1, R63)도 여기서 읽고 쓴다. 이 폰에만 있고 "이 폰의 내 자료 지우기"에 같이 지워진다.

import { load, save } from './store.js';
import { cleanGoal, cleanPeople } from './people.js';

export const getPeople = () => cleanPeople(load('people.v1', []));
export const setPeople = (list) => save('people.v1', cleanPeople(list));
export const getGoal = () => cleanGoal(load('goal.v1', null));
export const setGoal = (goal) => save('goal.v1', cleanGoal(goal));
