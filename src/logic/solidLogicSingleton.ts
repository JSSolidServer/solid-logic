import * as debug from "../util/debug"
import { authSession } from "../authSession/authSession"
import { SolidLogic } from "./SolidLogic"

const _fetch = async (url, requestInit) => {
    if (authSession.info.webId) {
        return authSession.fetch(url, requestInit)
    } else {
        return window.fetch(url, requestInit)
    }
}

//this const makes solidLogicSingleton global accessible in mashlib
const solidLogicSingleton = new SolidLogic({ fetch: _fetch }, authSession)

debug.log('Unique quadstore initialized.')

export { solidLogicSingleton }