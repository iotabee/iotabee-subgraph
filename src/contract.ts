import {Address, BigDecimal, BigInt, log} from "@graphprotocol/graph-ts"
import {
  Contract,
  Approval,
  ApprovalForAll,
  Collect,
  DecreaseLiquidity,
  IncreaseLiquidity,
  Transfer,
  Contract__positionsResult,
} from "../generated/Contract/Contract"
import {
  Pool
} from "../generated/Contract/Pool"
import {Snapshot, SnapshotFull} from "../generated/schema"

// const liquidity = ['49954253880', '55766298892962304', '12013501874740530845', '1613186886204'];
// const tvl = ['99909.787298', '20409.661212', '215.976725202', '11.859770078'];
const ethPrice = '2477.66';
const btcPrice = '41575.30';
const USDT = '0xa4f8C7C1018b9dD3be5835bF00f335D9910aF6Bd'.toLowerCase();
const USDC = '0xeCE555d37C37D55a6341b80cF35ef3BC57401d1A'.toLowerCase();
const WSMR = '0x6C890075406C5DF08b427609E3A2eAD1851AD68D'.toLowerCase();
const ETH = '0x4638C9fb4eFFe36C49d8931BB713126063BF38f9'.toLowerCase();
const WBTC = '0xb0119035d08CB5f467F9ed8Eae4E5f9626Aa7402'.toLowerCase();

function getIndexOfPool(positions: Contract__positionsResult): number {
  const token0 = positions.getToken0();
  const token1 = positions.getToken1();
  log.info('token0 {}, token1 {}', [token0.toHexString(), token1.toHexString()]);
  if (
    token0.equals(Address.fromString(USDT)) &&
    token1.equals(Address.fromString(USDC))
  ) {
    return 0;
  } else if (
    token0.equals(Address.fromString(WSMR)) &&
    token1.equals(Address.fromString(USDT))
  ) {
    return 1;
  } else if (
    token0.equals(Address.fromString(ETH)) &&
    token1.equals(Address.fromString(WSMR))
  ) {
    return 2;
  } else if (
    token0.equals(Address.fromString(WSMR)) &&
    token1.equals(Address.fromString(WBTC))
  ) {
    return 3;
  }
  return -1;
}

function getPoolAddr(positions: Contract__positionsResult): string {
  const token0 = positions.getToken0();
  const token1 = positions.getToken1();
  if (
    token0.equals(Address.fromString(USDT)) &&
    token1.equals(Address.fromString(USDC))
  ) {
    return '0x5f071D7428Fec69DA5F0aa8D5509ef980638e2aF';
  } else if (
    token0.equals(Address.fromString(WSMR)) &&
    token1.equals(Address.fromString(USDT))
  ) {
    return '0x6429C0764DA4f7BaeCf0c423A9f4911bF1Cb0eBF';
  } else if (
    token0.equals(Address.fromString(ETH)) &&
    token1.equals(Address.fromString(WSMR))
  ) {
    return '0xeDaD279fFC1279E44FCAcA4f09991EE3b30Fec1d';
  } else if (
    token0.equals(Address.fromString(WSMR)) &&
    token1.equals(Address.fromString(WBTC))
  ) {
    return '0xf8c42EA31B9fBf87dA7f7b5F47736652bDC00436';
  }
  return '0x0';
}

function getDecimal(addr: Address): i32 {
  if (addr.equals(Address.fromString(USDT))) {
    return 6;
  } else if (addr.equals(Address.fromString(USDC))) {
    return 6;
  } else if (addr.equals(Address.fromString(WSMR))) {
    return 18;
  } else if (addr.equals(Address.fromString(ETH))) {
    return 18;
  } else if (addr.equals(Address.fromString(WBTC))) {
    return 8;
  }
  return 18;
}

function calculateLiquidity(positions: Contract__positionsResult): BigDecimal {
  const lq = positions.getLiquidity();
  const addr = getPoolAddr(positions);
  const index = getIndexOfPool(positions);
  log.info('lq {}, addr {}, index {}', [lq.toString(), addr, index.toString()]);

  const poolContract = Pool.bind(Address.fromString(addr));
  const tick = poolContract.slot0().getTick();
  const liquidity = new BigDecimal(poolContract.liquidity());
  const sqrt10001 = Math.sqrt(1.0001);
  const decimals0 = getDecimal(positions.getToken0());
  const decimals1 = getDecimal(positions.getToken1());
  const pow0 = BigInt.fromI32(10).pow(u8(decimals0)).toBigDecimal();
  const pow1 = BigInt.fromI32(10).pow(u8(decimals1)).toBigDecimal();
  const reserve0 = liquidity.div(BigDecimal.fromString(Math.pow(sqrt10001, tick).toString())).div(pow0);
  const reserve1 = liquidity.times(BigDecimal.fromString(Math.pow(sqrt10001, tick).toString())).div(pow1);
  log.info('liquidity {}, tick {}, reserve0 {}, reserve1 {}', [liquidity.toString(), tick.toString(), reserve0.toString(), reserve1.toString()]);
  let tvl = BigDecimal.fromString('0');
  if (index === 0) {
    tvl = reserve0.plus(reserve1);
  } else if (index === 1) {
    tvl = reserve1.times(BigDecimal.fromString('2'));
  } else if (index === 2) {
    tvl = reserve0.times(BigDecimal.fromString('2')).times(BigDecimal.fromString(ethPrice));
  } else if (index === 3) {
    tvl = reserve1.times(BigDecimal.fromString('2')).times(BigDecimal.fromString(btcPrice));
  }
  log.info('tvl {}', [tvl.toString()]);

  return new BigDecimal(lq).times(tvl).div(liquidity);
}

export function handleApproval(event: Approval): void {}

export function handleApprovalForAll(event: ApprovalForAll): void {}

export function handleCollect(event: Collect): void {}

function handleLiquidity(tokenId: BigInt, addr: Address, timestamp: BigInt): void {
  const poolContract = Contract.bind(addr);
  log.info('1', []);
  const tryPositions = poolContract.try_positions(tokenId);
  if (tryPositions.reverted) {
    return;
  }

  const positions = tryPositions.value;
  log.info('2 fee {}', [positions.getFee().toString()]);
  const user = poolContract.ownerOf(tokenId);
  log.info('Token Id {}, owner {}', [tokenId.toString(), user.toHexString()]);

  const index = getIndexOfPool(positions);
  log.info('Index {}', [index.toString()]);
  if (index === -1) {
    return;
  }

  const sfid = `${user.toHexString()}_account`;
  let snapshotFull = SnapshotFull.load(sfid);
  if (snapshotFull == null) {
    snapshotFull = new SnapshotFull(sfid);
    snapshotFull.values = [BigDecimal.zero(), BigDecimal.zero(), BigDecimal.zero(), BigDecimal.zero()];
    snapshotFull.user = user;
    snapshotFull.save();
  }
  // TODO: update value
  snapshotFull = SnapshotFull.load(sfid);
  if (snapshotFull == null) {
    return;
  }

  let value = calculateLiquidity(positions);
  log.info('value {}, index {}', [(value || BigDecimal.zero()).toString(), i32(index).toString()]);
  const values = snapshotFull.values!;
  values[i32(index)] = (value || BigDecimal.zero());
  snapshotFull.values = values;
  log.info('values {} {} {} {}', values.map<string>((v: BigDecimal) => v.toString()));
  snapshotFull.save();

  const ts = i32(Math.ceil(timestamp.toI32() / 3600) * 3600);
  const id = `${user.toHexString()}_hourly_${ts.toString()}`;
  let snapshot = Snapshot.load(id);
  if (snapshot == null) {
    snapshot = new Snapshot(id);
    snapshot.timestamp = BigInt.fromI32(ts);
    snapshot.user = user;
  }
  snapshot.value = snapshotFull.values!.reduce((a, b) => a.plus(b), BigDecimal.zero())
  snapshot.save();
}

export function handleDecreaseLiquidity(event: DecreaseLiquidity): void {
  const tokenId = event.params.tokenId;
  const addr = event.address;
  const timestamp = event.block.timestamp;
  handleLiquidity(tokenId, addr, timestamp);
}

export function handleIncreaseLiquidity(event: IncreaseLiquidity): void {
  const tokenId = event.params.tokenId;
  const addr = event.address;
  const timestamp = event.block.timestamp;
  handleLiquidity(tokenId, addr, timestamp);
}

export function handleTransfer(event: Transfer): void {}
