import { $ as _$, type $Type } from 'jsr:@david/dax@^0.50.0'

export const $ = new Proxy(_$, {
  apply(target, thisArg, args: Parameters<$Type>) {
    return Reflect.apply(target.raw, thisArg, args).quiet().errorTail()
  },
})
