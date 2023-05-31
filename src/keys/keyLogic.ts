
import { schnorr } from '@noble/curves/secp256k1'
import { bytesToHex } from '@noble/hashes/utils'
import { KeyLogic, KeyType } from '../types'
import { NamedNode } from 'rdflib'
import * as debug from '../util/debug'
import { literal, st, lit } from 'rdflib'
import { createAclForKeysLogic } from './aclForKeysLogic'

export function createKeyLogic(store, utilityLogic): KeyLogic {
  const CERT = 'http://www.w3.org/ns/auth/cert#' // PrivateKey, PublicKey
  const aclKeyLogic = createAclForKeysLogic(store)

  function generatePrivateKey (): string {
    return bytesToHex(schnorr.utils.randomPrivateKey())
  }
  
  function generatePublicKey (privateKey: string): string {
    return bytesToHex(schnorr.getPublicKey(privateKey))
  }

  /**
 * getPublicKey
 * used for displaying messages in chat, therefore does not
 * create a new key if not found
 * @param webId
 * @returns string | undefined
 */
  async function getPublicKey (webId: NamedNode) {
    await store.fetcher.load(webId)
    const publicKeyDoc = await pubKeyUrl(webId)
    try {
      await store.fetcher.load(publicKeyDoc) // url.href)
      const key = store.any(webId, store.sym(CERT + 'PublicKey'))
      return key?.value // as NamedNode
    } catch (err) {
      return undefined
    }
  }

  async function getPrivateKey (webId: NamedNode) {
    await store.fetcher.load(webId)
    // find keys url's
    const publicKeyDoc = await pubKeyUrl(webId)
    const privateKeyDoc = await privKeyUrl(webId)

    // find key pair
    const publicKey = await getExistingPublicKey(webId, publicKeyDoc)
    let privateKey = await getExistingPrivateKey(webId, privateKeyDoc)

    // is publicKey valid ?
    let validPublicKey = true
    if (privateKey && (publicKey !== generatePublicKey(privateKey as string))) {
      if (confirm('This is strange the publicKey is not valid for\n' + webId?.uri +
      '\'shall we repair keeping the private key ?')) validPublicKey = false
    }

    // create key pair or repair publicKey
    if (!privateKey || !publicKey || !validPublicKey) {
      let del: any[] = []
      let add: any[] = []
      // if (privateKey) del.push($rdf.st(webId, store.sym(CERT + 'PrivateKey'), $rdf.lit(privateKey), store.sym(privateKeyDoc)))

      if (!privateKey) {
        // add = []
        privateKey = generatePrivateKey()
        add = [st(webId, store.sym(CERT + 'PrivateKey'), literal(privateKey), store.sym(privateKeyDoc))]
        await saveKey(privateKeyDoc, [], add, webId.uri)
      }
      if (!publicKey || !validPublicKey) {
        del = []
        // delete invalid public key
        if (publicKey) {
          del = [st(webId, store.sym(CERT + KeyType.PublicKey), lit(publicKey), store.sym(publicKeyDoc))]
          debug.log(del)
        }
        // update new valid key
        const newPublicKey = generatePublicKey(privateKey)
        add = [st(webId, store.sym(CERT + KeyType.PublicKey), literal(newPublicKey), store.sym(publicKeyDoc))]
        await saveKey(publicKeyDoc, del, add)
      }
      const keyContainer = privateKeyDoc.substring(0, privateKeyDoc.lastIndexOf('/') + 1)
      await aclKeyLogic.setAcl(keyContainer, aclKeyLogic.keyContainerAclBody(webId.uri)) // includes DELETE and PUT
    }
    return privateKey as string
  }

  async function pubKeyUrl (webId: NamedNode) {
    try {
      return await utilityLogic.getPodRoot(webId) + 'profile/keys/publicKey.ttl' // need to check if this is okay bc more logic in Alains.
    } catch (err) { throw new Error(err) }
  }

  async function privKeyUrl (webId: NamedNode) {
    try {
      return await utilityLogic.getPodRoot(webId) + 'profile/keys/privateKey.ttl'
    } catch (err) { throw new Error(err) }
  }  

  async function getExistingPrivateKey (webId: NamedNode, privateKeyUrl: string) {
    // find privateKey
    return await getKeyIfExists(webId, privateKeyUrl, KeyType.PrivateKey)
  }

  async function getExistingPublicKey (webId: NamedNode, publicKeyUrl: string) {
    // find publickey
    return await getKeyIfExists(webId, publicKeyUrl, KeyType.PublicKey)
  }

  async function getKeyIfExists (webId: NamedNode, keyUrl: string, keyType: KeyType) {
    try {
      await store.fetcher.load(keyUrl)
      const key = store.any(webId, store.sym(CERT + keyType))
      return key?.value // as NamedNode
    } catch (err) {
      if (err?.response?.status === 404) { // If PATCH on some server do not all create intermediate containers
        try {
          // create resource
          const data = ''
          const contentType = 'text/turtle'
          const response = await store.fetcher.webOperation('PUT', keyUrl, {
            data,
            contentType
          })
        } catch (err) {
          debug.log('createIfNotExists doc FAILED: ' + keyUrl + ': ' + err)
          throw err
        }
        delete store.fetcher.requested[keyUrl] // delete cached 404 error
        return undefined
      }
      debug.log('createIfNotExists doc FAILED: ' + keyUrl + ': ' + err)
      throw err
    }
  }
  /**
   * delete acl if keydoc exists
   * create/edit keyDoc
   * set keyDoc acl
   */
  async function saveKey (keyDoc: string, del, add, me: string = '') {
      await deleteKey(keyDoc)
      // save key
      await store.updater.updateMany(del, add) // or a promise store.updater.update ?

      // create READ only ACL
      const aclBody = aclKeyLogic.keyAclBody(keyDoc, me)
      await aclKeyLogic.setAcl(keyDoc, aclBody)
    
  }

  async function deleteKey (keyDoc: string) {
    await store.fetcher.load(keyDoc)
    try { //here 
      // get keyAcldoc
    // get keyAcldoc
      const keyAclDoc = store.any(store.sym(keyDoc), store.sym('http://www.iana.org/assignments/link-relations/acl'))
      if (keyAclDoc) {
        // delete READ only keyAclDoc. This is possible if the webId is an owner
        try {
          const response = await store.fetcher.webOperation('DELETE', keyAclDoc.value) // this may fail if webId is not an owner
          debug.log('delete ' + keyAclDoc.value + ' ' + response.status) // should test 404 and 2xx
        } catch (err) {
          if (err.response.status !== 404) { throw new Error(err) }
          debug.log('delete ' + keyAclDoc.value + ' ' + err.response.status) // should test 404 and 2xx
        } 
      } 
    } catch (err) {
      throw err
    }
  }
  
  return {
    generatePrivateKey,
    generatePublicKey,
    getPrivateKey,
    getPublicKey,
  }
}