import {Address, BigDecimal, BigInt} from "@graphprotocol/graph-ts"
import {
  Contract,
  Approval,
  ApprovalForAll,
  Collect,
  DecreaseLiquidity,
  IncreaseLiquidity,
  Transfer,
  Contract__positionsResult
} from "../generated/Contract/Contract"
import {Snapshot, SnapshotFull} from "../generated/schema"

const liquidity = ['49954253880', '55766298892962304', '12013501874740530845', '1613186886204'];
const tvl = ['99909.787298', '20409.661212', '215.976725202', '11.859770078']

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

function calculateLiquidity(positions: Contract__positionsResult): BigDecimal {
  const token0 = positions.getToken0();
  const token1 = positions.getToken1();
  const fee = positions.getFee();
  const lq = positions.getLiquidity();
  const tickLower = positions.getTickLower();
  const tickUpper = positions.getTickUpper();
  const index = getIndexOfPool(positions);
  const totalLq = liquidity[i32(index)];
  const totalTvl = tvl[i32(index)];
  return new BigDecimal(lq).times(BigDecimal.fromString(totalTvl)).div(BigDecimal.fromString(totalLq));
}

export function handleApproval(event: Approval): void {}

export function handleApprovalForAll(event: ApprovalForAll): void {}

export function handleCollect(event: Collect): void {}

function handleLiquidity(tokenId: BigInt, addr: Address, timestamp: BigInt): void {
  const poolContract = Contract.bind(addr);
  const positions = poolContract.positions(tokenId);
  const user = poolContract.ownerOf(tokenId);

  const index = getIndexOfPool(positions);

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
    snapshot.value = snapshotFull.values!.reduce((a, b) => a.plus(b), BigDecimal.zero())
    snapshot.timestamp = BigInt.fromI32(i32(ts));
    snapshot.user = user;
    snapshot.save();
  }
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
