// 만난 사람을 폰에만 남긴다 (ces2027.people.v1). 일기 보내기 묶음에는 들어가지 않는다.

import { load, save } from './store.js';
import { cleanPeople } from './people.js';

export const getPeople = () => cleanPeople(load('people.v1', []));
export const setPeople = (list) => save('people.v1', cleanPeople(list));
