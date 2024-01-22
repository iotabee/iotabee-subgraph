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

const liquidity = ['49954253880', '55766298892962304', '12013501874740530845', '1613186886204'];
const tvl = ['99909.787298', '20409.661212', '215.976725202', '11.859770078'];
const ethPrice = '2477.66';
const btcPrice = '41575.30';

function getIndexOfPool(positions: Contract__positionsResult): number {
  const token0 = positions.getToken0();
  const token1 = positions.getToken1();
  if (
    token0.equals(Address.fromString('0xa4f8C7C1018b9dD3be5835bF00f335D9910aF6Bd')) &&
    token1.equals(Address.fromString('0xeCE555d37C37D55a6341b80cF35ef3BC57401d1A'))
  ) {
    return 0;
  } else if (
    token0.equals(Address.fromString('0x6C890075406C5DF08b427609E3A2eAD1851AD68D')) &&
    token1.equals(Address.fromString('0xa4f8C7C1018b9dD3be5835bF00f335D9910aF6Bd'))
  ) {
    return 1;
  } else if (
    token0.equals(Address.fromString('0x4638C9fb4eFFe36C49d8931BB713126063BF38f9')) &&
    token1.equals(Address.fromString('0x6C890075406C5DF08b427609E3A2eAD1851AD68D'))
  ) {
    return 2;
  } else if (
    token0.equals(Address.fromString('0x6C890075406C5DF08b427609E3A2eAD1851AD68D')) &&
    token1.equals(Address.fromString('0xb0119035d08CB5f467F9ed8Eae4E5f9626Aa7402'))
  ) {
    return 3;
  }
  return -1;
}

function getPoolAddr(positions: Contract__positionsResult): string {
  const token0 = positions.getToken0();
  const token1 = positions.getToken1();
  if (
    token0.equals(Address.fromString('0xa4f8C7C1018b9dD3be5835bF00f335D9910aF6Bd')) &&
    token1.equals(Address.fromString('0xeCE555d37C37D55a6341b80cF35ef3BC57401d1A'))
  ) {
    return '0x5f071D7428Fec69DA5F0aa8D5509ef980638e2aF';
  } else if (
    token0.equals(Address.fromString('0x6C890075406C5DF08b427609E3A2eAD1851AD68D')) &&
    token1.equals(Address.fromString('0xa4f8C7C1018b9dD3be5835bF00f335D9910aF6Bd'))
  ) {
    return '0x6429C0764DA4f7BaeCf0c423A9f4911bF1Cb0eBF';
  } else if (
    token0.equals(Address.fromString('0x4638C9fb4eFFe36C49d8931BB713126063BF38f9')) &&
    token1.equals(Address.fromString('0x6C890075406C5DF08b427609E3A2eAD1851AD68D'))
  ) {
    return '0xeDaD279fFC1279E44FCAcA4f09991EE3b30Fec1d';
  } else if (
    token0.equals(Address.fromString('0x6C890075406C5DF08b427609E3A2eAD1851AD68D')) &&
    token1.equals(Address.fromString('0xb0119035d08CB5f467F9ed8Eae4E5f9626Aa7402'))
  ) {
    return '0xf8c42EA31B9fBf87dA7f7b5F47736652bDC00436';
  }
  return '0x0';
}

function calculateLiquidity(positions: Contract__positionsResult): BigDecimal {
  const lq = positions.getLiquidity();
  const addr = getPoolAddr(positions);
  const index = getIndexOfPool(positions);

  const poolContract = Pool.bind(Address.fromString(addr));
  const tick = poolContract.slot0().getTick();
  const liquidity = new BigDecimal(poolContract.liquidity());
  const sqrt10001 = Math.sqrt(1.0001);
  const reserve0 = liquidity.div(BigDecimal.fromString(Math.pow(sqrt10001, tick).toString()));
  const reserve1 = liquidity.times(BigDecimal.fromString(Math.pow(sqrt10001, tick).toString()));
  let tvl = BigDecimal.fromString('0');
  if (index === 0) {
    tvl = reserve0.plus(reserve1);
  } else if (index === 1) {
    tvl = reserve1.times(BigDecimal.fromString('2'));
  } else if (index === 2) {
    tvl = reserve0.times(BigDecimal.fromString('2')).times(BigDecimal.fromString(ethPrice));
  } else if (index === 3) {
    tvl = reserve0.times(BigDecimal.fromString('2')).times(BigDecimal.fromString(btcPrice));
  }

  return new BigDecimal(lq).times(tvl).div(liquidity);
}

export function handleApproval(event: Approval): void {}

export function handleApprovalForAll(event: ApprovalForAll): void {}

export function handleCollect(event: Collect): void {}

function handleLiquidity(tokenId: BigInt, addr: Address, timestamp: BigInt): void {
  const poolContract = Contract.bind(addr);
  const positions = poolContract.positions(tokenId);
  const user = poolContract.ownerOf(tokenId);

  const index = getIndexOfPool(positions);
  if (index === -1) {
    return;
  }

  const ts = Math.ceil(timestamp.toI32() / 3600) * 3600;
  const sfid = `${user}_account`;
  let snapshotFull = SnapshotFull.load(sfid);
  if (snapshotFull == null) {
    snapshotFull = new SnapshotFull(sfid);
    snapshotFull.values = [BigDecimal.zero(), BigDecimal.zero(), BigDecimal.zero(), BigDecimal.zero()];
    snapshotFull.user = user;
    snapshotFull.save();
  }
  // TODO: update value
  let value = calculateLiquidity(positions);
  snapshotFull.values![i32(index)] = value || BigDecimal.zero();
  snapshotFull.save();

  const id = `${user}_hourly_${ts}`;
  let snapshot = Snapshot.load(id);
  if (snapshot == null) {
    snapshot = new Snapshot(id);
    snapshot.timestamp = BigInt.fromI32(i32(ts));
    snapshot.user = user;
  }
  snapshot.value = snapshotFull.values!.reduce((a, b) => a.plus(b), BigDecimal.zero())
  snapshot.save();
}

export function handleDecreaseLiquidity(event: DecreaseLiquidity): void {
  log.info('decrease liquidity', []);
  const tokenId = event.params.tokenId;
  const addr = event.address;
  const timestamp = event.block.timestamp;
  handleLiquidity(tokenId, addr, timestamp);
}

export function handleIncreaseLiquidity(event: IncreaseLiquidity): void {
  log.info('increase liquidity', []);
  const tokenId = event.params.tokenId;
  const addr = event.address;
  const timestamp = event.block.timestamp;
  handleLiquidity(tokenId, addr, timestamp);
}

export function handleTransfer(event: Transfer): void {
  console.log(`${event.address}`);
}
