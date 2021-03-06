import log from '../../helpers/log'
import validateAddress from '../../helpers/validateAddress'
import { FileSystem as fs, Semver, Contracts } from 'zos-lib'
import { fetchJurisdiction, fetchNetworkFile, fetchValidator, fetchVouching, fetchZepToken } from '../contracts/fetch'

import {
  VOUCHING_MIN_STAKE,
  ZEPPELIN_ORG_NAME,
  ZEPTOKEN_NAME,
  ZEPTOKEN_SUPPLY,
  ZEPTOKEN_SYMBOL,
  ZEPTOKEN_DECIMALS,
  ZEPTOKEN_ATTRIBUTE_ID,
  ZEPPELIN_ORG_MAX_ADDRESSES,
} from '../constants'

export default async function verify({ network, txParams }) {
  log.info(`Verifying vouching app on network ${ network }...`)
  if (await verifyAppSetup(network)) {
    const successfulJurisdiction = await verifyJurisdiction(network, txParams)
    const successfulZepToken = await verifyZEPToken(network, txParams)
    const successfulVouching = await verifyVouching(network)
    const successfulValidator = await verifyOrganizationsValidator(network, txParams)
    const successfulConfiguration = await verifyTPLConfiguration(network, txParams)

    if (successfulJurisdiction && successfulZepToken && successfulVouching && successfulValidator && successfulConfiguration) {
      log.info('\n\nVouching app was deployed and configured successfully!')
    }
    else {
      log.error('\n\nCould not complete verification process since there are required previous steps not completed.')
    }
  }
  else {
    log.error('\n\nCould not complete verification process since there are required previous steps not completed.')
  }
}

export async function verifyAppSetup(network) {
  const networkFile = fetchNetworkFile(network)

  log.base('\n--------------------------------------------------------------------\n')
  log.base('Verifying ZeppelinOS app...')

  if (fs.exists(networkFile.fileName)) {
    const validAppAddress = validateAddress(networkFile.appAddress)
    const validPackageAddress = validateAddress(networkFile.packageAddress)
    const validVersion = networkFile.version && networkFile.version !== ''

    validAppAddress
      ? log.info (' ✔ App address is valid')
      : log.error(` ✘ App address ${networkFile.appAddress} is not valid`)

    validPackageAddress
      ? log.info (' ✔ Package address is valid')
      : log.error(` ✘ Package address ${networkFile.packageAddress} is not valid`)

    validVersion
      ? log.info (' ✔ Version name is valid')
      : log.error(` ✘ Version name "${networkFile.version}" is not valid`)

    if (validAppAddress && validPackageAddress && validVersion) {
      const App = Contracts.getFromNodeModules('zos-lib', 'App')
      const app = App.at(networkFile.appAddress)
      const [packageAddress, version] = await app.getPackage('zos-vouching')
      const registeredPackage = packageAddress === networkFile.packageAddress
      const registeredVersion = Semver.semanticVersionEqual(version, networkFile.version)

      registeredPackage
        ? log.info (' ✔ Package address is registered on the app')
        : log.error(` ✘ Package address ${networkFile.packageAddress} is not registered on the app ${networkFile.appAddress}`)

      registeredVersion
        ? log.info (' ✔ Requested version is registered on-chain')
        : log.error(` ✘ Requested version ${networkFile.version} is not registered on-chain, it was expected ${version}`)

      return registeredPackage && registeredVersion
    }
    else return false
  }
  else {
    log.error(` ✘ Cannot find ZeppelinOS ${network} file.`)
    return false
  }
}

export async function verifyJurisdiction(network, txParams) {
  log.base('\n--------------------------------------------------------------------\n')
  log.base('Verifying basic jurisdiction...')

  const jurisdiction = fetchJurisdiction(network)
  if (jurisdiction) {
    const jurisdictionOwner = await jurisdiction.owner()
    const ownerMatches = jurisdictionOwner === txParams.from

    ownerMatches
      ? log.info (' ✔ Jurisdiction owner matches requested owner')
      : log.error(` ✘ Jurisdiction owner ${jurisdictionOwner} does not match requested owner, it was expected ${txParams.from}`)

    return ownerMatches
  } 
  else {
    log.error(' ✘ Missing valid instance of BasicJurisdiction')
    return false
  }
}

export async function verifyZEPToken(network, txParams) {
  log.base('\n--------------------------------------------------------------------\n')
  log.base('Verifying ZEP Token...')

  const zepToken = fetchZepToken(network)
  if (zepToken) {
    const name = await zepToken.name()
    const symbol = await zepToken.symbol()
    const decimals = await zepToken.decimals()
    const totalSupply = await zepToken.totalSupply()

    const isPauser = await zepToken.isPauser(txParams.from)
    const nameMatches = name === ZEPTOKEN_NAME
    const symbolMatches = symbol === ZEPTOKEN_SYMBOL
    const decimalsMatches = decimals.eq(ZEPTOKEN_DECIMALS)
    const totalSupplyMatches = totalSupply.eq(new web3.BigNumber(`${ZEPTOKEN_SUPPLY}e${decimals}`))

    isPauser
      ? log.info (' ✔ ZEP Token deployer has pauser role')
      : log.error(` ✘ ZEP Token deployer ${txParams.from} does not have pauser role`)

    nameMatches
      ? log.info (' ✔ ZEP Token name matches requested value')
      : log.error(` ✘ ZEP Token name "${name}" does not match expected value "${ZEPTOKEN_NAME}"`)

    symbolMatches
      ? log.info (' ✔ ZEP Token symbol matches requested value')
      : log.error(` ✘ ZEP Token symbol "${symbol}" does not match expected value "${ZEPTOKEN_SYMBOL}"`)

    decimalsMatches
      ? log.info (' ✔ ZEP Token decimals matches the requested value')
      : log.error(` ✘ ZEP Token decimals ${decimals} does not match expected value ${ZEPTOKEN_DECIMALS}`)

    totalSupplyMatches
      ? log.info (' ✔ ZEP Token total supply matches the requested value')
      : log.error(` ✘ ZEP Token total supply ${totalSupply} does not match expected value ${ZEPTOKEN_SUPPLY}`)

    return isPauser && nameMatches && symbolMatches && decimalsMatches && totalSupplyMatches
  }
  else {
    log.error(' ✘ Missing valid instance of ZEP Token')
    return false
  }
}

export async function verifyVouching(network) {
  log.base('\n--------------------------------------------------------------------\n')
  log.base('Verifying Vouching contract...')

  const vouching = fetchVouching(network)
  if (vouching) {
    const token = await vouching.token()
    const minimumStake = await vouching.minimumStake()

    const zepTokenAddress = fetchZepToken(network).address
    const tokenMatches = token === zepTokenAddress
    const minimumStakeMatches = minimumStake.eq(VOUCHING_MIN_STAKE)

    tokenMatches
      ? log.info (' ✔ Vouching token matches ZEP Token deployed instance')
      : log.error(` ✘ Vouching token ${token} does not match ZEP Token deployed instance ${zepTokenAddress}`)

    minimumStakeMatches
      ? log.info (' ✔ Vouching minimum stake matches requested value')
      : log.error(` ✘ Vouching minimum stake ${minimumStake} does not match requested value, it was expected ${VOUCHING_MIN_STAKE}`)

    return tokenMatches && minimumStakeMatches
  }
  else {
    log.error(' ✘ Missing valid instance of Vouching')
    return false
  }
}

export async function verifyOrganizationsValidator(network, txParams) {
  log.base('\n--------------------------------------------------------------------\n')
  log.base('Verifying Organizations validator...')

  const validator = fetchValidator(network)
  if (validator) {
    const owner = await validator.owner()
    const jurisdiction = await validator.getJurisdiction()

    const jurisdictionAddress = fetchJurisdiction(network).address
    const ownerMatches = owner === txParams.from
    const jurisdictionMatches = jurisdiction === jurisdictionAddress

    ownerMatches
      ? log.info (' ✔ Organizations validator owner matches requested value')
      : log.error(` ✘ Organizations validator owner ${owner} does not match requested value, it was expected ${txParams.from}`)

    jurisdictionMatches
      ? log.info (' ✔ Organizations validator jurisdiction matches BasicJurisdiction deployed instance')
      : log.error(` ✘ Organizations validator jurisdiction ${jurisdiction} does not match BasicJurisdiction deployed instance ${jurisdictionAddress}`)

    return ownerMatches && jurisdictionMatches
  }
  else {
    log.error(' ✘ Missing valid instance of OrganizationsValidator')
    return false
  }
}

export async function verifyTPLConfiguration(network, txParams) {
  log.base('\n--------------------------------------------------------------------\n')
  log.base('Verifying TPL configuration...')

  const jurisdiction = fetchJurisdiction(network)
  const validator = fetchValidator(network)

  if (jurisdiction && validator) {
    const [exists, maximumAccounts, name] = await validator.getOrganizationInformation(txParams.from)

    const isValidator = await jurisdiction.isValidator(validator.address)
    const canIssueAttributeType = await jurisdiction.canIssueAttributeType(validator.address, ZEPTOKEN_ATTRIBUTE_ID)
    const organizationMatches = exists && name === ZEPPELIN_ORG_NAME
    const maximumAccountsMatches = maximumAccounts.eq(ZEPPELIN_ORG_MAX_ADDRESSES)

    isValidator
      ? log.info (' ✔ Organizations validator is correctly set as a validator on the jurisdiction')
      : log.error(` ✘ Organizations validator ${validator.address} is not set as a validator on the jurisdiction ${jurisdiction.address}`)

    canIssueAttributeType
      ? log.info (' ✔ Organizations validator is cleared for approval of ZEP Token attribute ID on the jurisdiction')
      : log.error(` ✘ Organizations validator ${validator.address} is not cleared for approval of ZEP Token attribute ID ${ZEPTOKEN_ATTRIBUTE_ID} on the jurisdiction ${jurisdiction.address}`)

    organizationMatches
      ? log.info (' ✔ Zeppelin organization was properly set in the OrganizationsValidator')
      : log.error(` ✘ Zeppelin organization "${ZEPPELIN_ORG_NAME}" is not set in the OrganizationsValidator`)

    maximumAccountsMatches
      ? log.info (' ✔ Zeppelin organization number of maximum accounts was properly set')
      : log.error(` ✘ Zeppelin organization number of maximum accounts "${maximumAccounts}" does not match, it was expected ${ZEPPELIN_ORG_MAX_ADDRESSES}`)

    return isValidator && canIssueAttributeType && organizationMatches && maximumAccountsMatches
  }
  else {
    log.error(' ✘ Could not verify TPL configuration due to missing validator or jurisdiction')
    return false
  }
}
