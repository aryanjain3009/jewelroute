/* Real webhook payloads, one per event type, captured from the outbox of a local stack after driving
 * every flow through the API (scratchpad script events.mjs: check-in, photo, orders confirmed /
 * pending / approved / rejected / settled / cancelled, memo created / acknowledged / extended /
 * returned / converted / overdue, custody move, visit completed, test ping). Only the proof URL host
 * and its byte size were changed. Regenerate when the emit code in apps/api changes. */
export type LiveEvent = { id: string; type: string; tenantId: string; createdAt: string; data: Record<string, unknown> };
export const EVENTS: Record<string, LiveEvent> = {
  "memo.acknowledged": {
    "id": "evt_01M5G0K7TK4XXBQ0Z365XED1TX",
    "data": {
      "by": "retailer",
      "shop": {
        "id": "cmvij7zb200097de7b66mbahm",
        "name": "Sharma Jewellers"
      },
      "ackAt": "2026-10-21T19:56:45.763Z",
      "agent": {
        "id": "cmvij7z9k00027de7ikoa9y4j",
        "name": "Rahul Verma"
      },
      "memoId": "cmvij9eyr008x7de7osd7reg9",
      "method": "QR_CONFIRM",
      "number": "MEMO-2026-00013",
      "pieces": [
        {
          "id": "pc_01M5G0H6D207Z1TPD0GSME90NV",
          "tagCode": "AJ-S-000121"
        },
        {
          "id": "pc_01M5G0H6D2A9W9ABXDSH7E4KEK",
          "tagCode": "AJ-S-000123"
        },
        {
          "id": "pc_01M5G0H6D2C1JK7ZJP91X7D1ZN",
          "tagCode": "AJ-S-000125"
        }
      ],
      "visitId": "cmvij7zn1005c7de7awr9r5nv",
      "pieceCount": 3,
      "totalValuePaise": 98196904,
      "selfAckSuspected": false
    },
    "type": "memo.acknowledged",
    "tenantId": "aurum",
    "createdAt": "2026-10-21T19:56:45.779Z"
  },
  "memo.converted": {
    "id": "evt_01M5G0K80TXTVRDHHT28FMK695",
    "data": {
      "shop": {
        "id": "cmvij7zb200097de7b66mbahm",
        "area": "Karol Bagh",
        "name": "Sharma Jewellers"
      },
      "agent": {
        "id": "cmvij7z9k00027de7ikoa9y4j",
        "name": "Rahul Verma"
      },
      "memoId": "cmvij9eyr008x7de7osd7reg9",
      "number": "MEMO-2026-00013",
      "pieces": [
        {
          "id": "pc_01M5G0H6D2A9W9ABXDSH7E4KEK",
          "tagCode": "AJ-S-000123"
        }
      ],
      "status": "PARTIALLY_RETURNED",
      "orderId": "cmvij9f5x00am7de7dp1xls4z",
      "visitId": "cmvij7zn1005c7de7awr9r5nv",
      "pieceCount": 1,
      "totalPaise": 36798102,
      "orderNumber": "ORD-2026-00043",
      "outstandingCount": 1
    },
    "type": "memo.converted",
    "tenantId": "aurum",
    "createdAt": "2026-10-21T19:56:45.978Z"
  },
  "memo.created": {
    "id": "evt_01M5G0K7SCSXMAVQZ80BCEWYWV",
    "data": {
      "shop": {
        "id": "cmvij7zb200097de7b66mbahm",
        "name": "Sharma Jewellers"
      },
      "agent": {
        "id": "cmvij7z9k00027de7ikoa9y4j",
        "name": "Rahul Verma"
      },
      "memoId": "cmvij9eyr008x7de7osd7reg9",
      "number": "MEMO-2026-00013",
      "pieces": [
        {
          "id": "pc_01M5G0H6D207Z1TPD0GSME90NV",
          "sku": "AJ-BNG-2201",
          "name": "Rajwada Kada",
          "purity": "K22",
          "tagCode": "AJ-S-000121",
          "valuePaise": 35442087,
          "netWeightMg": 31673
        },
        {
          "id": "pc_01M5G0H6D2A9W9ABXDSH7E4KEK",
          "sku": "AJ-BNG-2201",
          "name": "Rajwada Kada",
          "purity": "K22",
          "tagCode": "AJ-S-000123",
          "valuePaise": 35726313,
          "netWeightMg": 31927
        },
        {
          "id": "pc_01M5G0H6D2C1JK7ZJP91X7D1ZN",
          "sku": "AJ-BNG-2202",
          "name": "Noor Filigree Bangle Pair",
          "purity": "K22",
          "tagCode": "AJ-S-000125",
          "valuePaise": 27028504,
          "netWeightMg": 24004
        }
      ],
      "dueDate": "2026-10-27",
      "visitId": "cmvij7zn1005c7de7awr9r5nv",
      "pieceCount": 3,
      "totalValuePaise": 98196904
    },
    "type": "memo.created",
    "tenantId": "aurum",
    "createdAt": "2026-10-21T19:56:45.740Z"
  },
  "memo.extended": {
    "id": "evt_01M5G0K7WJY5FYAEYWGWR55EJ9",
    "data": {
      "shop": {
        "id": "cmvij7zb200097de7b66mbahm",
        "name": "Sharma Jewellers"
      },
      "actor": {
        "id": "cmvij7z9k00027de7ikoa9y4j",
        "name": "Rahul Verma"
      },
      "agent": {
        "id": "cmvij7z9k00027de7ikoa9y4j",
        "name": "Rahul Verma"
      },
      "memoId": "cmvij9eyr008x7de7osd7reg9",
      "number": "MEMO-2026-00013",
      "reason": "Retailer showing pieces at a wedding on Saturday",
      "dueDate": "2026-10-31",
      "visitId": "cmvij7zn1005c7de7awr9r5nv",
      "fromDueDate": "2026-10-27"
    },
    "type": "memo.extended",
    "tenantId": "aurum",
    "createdAt": "2026-10-21T19:56:45.842Z"
  },
  "memo.overdue": {
    "id": "evt_01M5G0K8DA7238BJEP99K8XEV7",
    "data": {
      "shop": {
        "id": "cmvij7zb200097de7b66mbahm",
        "name": "Sharma Jewellers"
      },
      "agent": {
        "id": "cmvij7z9k00027de7ikoa9y4j",
        "name": "Rahul Verma"
      },
      "memoId": "cmvij9eyr008x7de7osd7reg9",
      "number": "MEMO-2026-00013",
      "dueDate": "2026-10-19",
      "pieceCount": 1,
      "totalValuePaise": 27028504
    },
    "type": "memo.overdue",
    "tenantId": "aurum",
    "createdAt": "2026-10-21T19:56:46.378Z"
  },
  "memo.returned": {
    "id": "evt_01M5G0K7Y83QTQX3F0XGK290YE",
    "data": {
      "shop": {
        "id": "cmvij7zb200097de7b66mbahm",
        "name": "Sharma Jewellers"
      },
      "agent": {
        "id": "cmvij7z9k00027de7ikoa9y4j",
        "name": "Rahul Verma"
      },
      "memoId": "cmvij9eyr008x7de7osd7reg9",
      "number": "MEMO-2026-00013",
      "pieces": [
        {
          "id": "pc_01M5G0H6D207Z1TPD0GSME90NV",
          "tagCode": "AJ-S-000121"
        }
      ],
      "status": "PARTIALLY_RETURNED",
      "visitId": "cmvij7zn1005c7de7awr9r5nv",
      "pieceCount": 1,
      "totalValuePaise": 35442087,
      "outstandingCount": 2
    },
    "type": "memo.returned",
    "tenantId": "aurum",
    "createdAt": "2026-10-21T19:56:45.896Z"
  },
  "order.approved": {
    "id": "evt_01M5G0K81WCMCCHSC15QHFG477",
    "data": {
      "shop": {
        "id": "cmvij7zb200097de7b66mbahm",
        "name": "Sharma Jewellers"
      },
      "actor": {
        "id": "cmvij7za600047de7w0tu3ivx",
        "name": "Priya Mehta"
      },
      "agent": {
        "id": "cmvij7z9k00027de7ikoa9y4j",
        "name": "Rahul Verma"
      },
      "number": "ORD-2026-00041",
      "status": "APPROVED",
      "orderId": "cmvij9ew0008b7de7o8c7j92m",
      "reasons": [
        "CREDIT_LIMIT",
        "ORDER_THRESHOLD"
      ],
      "visitId": "cmvij7zn1005c7de7awr9r5nv",
      "agentRef": {
        "id": "cmvij7z9k00027de7ikoa9y4j",
        "name": "Rahul Verma"
      },
      "totalPaise": 146606904
    },
    "type": "order.approved",
    "tenantId": "aurum",
    "createdAt": "2026-10-21T19:56:46.012Z"
  },
  "order.cancelled": {
    "id": "evt_01M5G0K85MVPQA7RY365AYT778",
    "data": {
      "shop": {
        "id": "cmvij7zb200097de7b66mbahm",
        "name": "Sharma Jewellers"
      },
      "actor": {
        "id": "cmvij7za600047de7w0tu3ivx",
        "name": "Priya Mehta"
      },
      "agent": {
        "id": "cmvij7z9k00027de7ikoa9y4j",
        "name": "Rahul Verma"
      },
      "number": "ORD-2026-00040",
      "status": "CANCELLED",
      "orderId": "cmvij9eu1007t7de7je9ftexc",
      "visitId": "cmvij7zn1005c7de7awr9r5nv",
      "fromStatus": "PENDING_APPROVAL",
      "totalPaise": 162610220,
      "cancellationReason": "Retailer changed the design"
    },
    "type": "order.cancelled",
    "tenantId": "aurum",
    "createdAt": "2026-10-21T19:56:46.132Z"
  },
  "order.confirmed": {
    "id": "evt_01M5G0K7HM4MNF7761HFK132VS",
    "data": {
      "shop": {
        "id": "cmvij7zb200097de7b66mbahm",
        "name": "Sharma Jewellers"
      },
      "agent": {
        "id": "cmvij7z9k00027de7ikoa9y4j",
        "name": "Rahul Verma"
      },
      "credit": {
        "asOf": "2026-10-21T19:56:45.474Z",
        "shopId": "cmvij7zb200097de7b66mbahm",
        "reasons": [],
        "overLimit": false,
        "exposurePaise": 80000000,
        "creditLimitPaise": 250000000,
        "orderAmountPaise": 92553122,
        "outstandingPaise": 80000000,
        "requiresApproval": false,
        "memoExposurePaise": 0,
        "availableCreditPaise": 170000000,
        "unsettledOrdersPaise": 0,
        "approvalThresholdPaise": 100000000,
        "projectedExposurePaise": 172553122,
        "openingOutstandingPaise": 80000000
      },
      "number": "ORD-2026-00039",
      "status": "CONFIRMED",
      "orderId": "cmvij9esk007i7de7lq2kl4xj",
      "reasons": [],
      "visitId": "cmvij7zn1005c7de7awr9r5nv",
      "totalPaise": 92553122
    },
    "type": "order.confirmed",
    "tenantId": "aurum",
    "createdAt": "2026-10-21T19:56:45.492Z"
  },
  "order.created": {
    "id": "evt_01M5G0K7HFCYEYVQ2F9K1T9Z6E",
    "data": {
      "shop": {
        "id": "cmvij7zb200097de7b66mbahm",
        "name": "Sharma Jewellers"
      },
      "agent": {
        "id": "cmvij7z9k00027de7ikoa9y4j",
        "name": "Rahul Verma"
      },
      "items": [
        {
          "sku": "AJ-BNG-2201",
          "name": "Rajwada Kada",
          "purity": "K22",
          "quantity": 1,
          "netWeightMg": 31800,
          "lineTotalPaise": 35584200,
          "unitPricePaise": 35584200
        },
        {
          "sku": "AJ-BNG-2202",
          "name": "Noor Filigree Bangle Pair",
          "purity": "K22",
          "quantity": 2,
          "netWeightMg": 24100,
          "lineTotalPaise": 54273200,
          "unitPricePaise": 27136600
        }
      ],
      "number": "ORD-2026-00039",
      "status": "CONFIRMED",
      "orderId": "cmvij9esk007i7de7lq2kl4xj",
      "visitId": "cmvij7zn1005c7de7awr9r5nv",
      "approval": {
        "reasons": [],
        "required": false
      },
      "gstPaise": 2695722,
      "totalPaise": 92553122,
      "subtotalPaise": 89857400,
      "goldRateSnapshot": [
        {
          "purity": "K22",
          "goldRateId": "gr_01M5G0H6CD9G12SNGKHMB5VXP5",
          "effectiveFrom": "2026-10-21T19:54:38.765Z",
          "ratePaisePerGram": 1054000
        }
      ]
    },
    "type": "order.created",
    "tenantId": "aurum",
    "createdAt": "2026-10-21T19:56:45.487Z"
  },
  "order.pending_approval": {
    "id": "evt_01M5G0K7K9840WGP8EH0WSB4XZ",
    "data": {
      "shop": {
        "id": "cmvij7zb200097de7b66mbahm",
        "name": "Sharma Jewellers"
      },
      "agent": {
        "id": "cmvij7z9k00027de7ikoa9y4j",
        "name": "Rahul Verma"
      },
      "credit": {
        "asOf": "2026-10-21T19:56:45.525Z",
        "shopId": "cmvij7zb200097de7b66mbahm",
        "reasons": [
          "CREDIT_LIMIT",
          "ORDER_THRESHOLD"
        ],
        "overLimit": false,
        "exposurePaise": 172553122,
        "creditLimitPaise": 250000000,
        "orderAmountPaise": 162610220,
        "outstandingPaise": 172553122,
        "requiresApproval": true,
        "memoExposurePaise": 0,
        "availableCreditPaise": 77446878,
        "unsettledOrdersPaise": 92553122,
        "approvalThresholdPaise": 100000000,
        "projectedExposurePaise": 335163342,
        "openingOutstandingPaise": 80000000
      },
      "number": "ORD-2026-00040",
      "status": "PENDING_APPROVAL",
      "orderId": "cmvij9eu1007t7de7je9ftexc",
      "reasons": [
        "CREDIT_LIMIT",
        "ORDER_THRESHOLD"
      ],
      "visitId": "cmvij7zn1005c7de7awr9r5nv",
      "totalPaise": 162610220
    },
    "type": "order.pending_approval",
    "tenantId": "aurum",
    "createdAt": "2026-10-21T19:56:45.545Z"
  },
  "order.rejected": {
    "id": "evt_01M5G0K83M4HBH39PCZVHRQZJZ",
    "data": {
      "shop": {
        "id": "cmvij7zb200097de7b66mbahm",
        "name": "Sharma Jewellers"
      },
      "actor": {
        "id": "cmvij7za600047de7w0tu3ivx",
        "name": "Priya Mehta"
      },
      "agent": {
        "id": "cmvij7z9k00027de7ikoa9y4j",
        "name": "Rahul Verma"
      },
      "number": "ORD-2026-00042",
      "status": "REJECTED",
      "orderId": "cmvij9exn008l7de7e3rfa5ze",
      "reasons": [
        "CREDIT_LIMIT",
        "ORDER_THRESHOLD"
      ],
      "visitId": "cmvij7zn1005c7de7awr9r5nv",
      "agentRef": {
        "id": "cmvij7z9k00027de7ikoa9y4j",
        "name": "Rahul Verma"
      },
      "totalPaise": 111802792,
      "rejectionReason": "Over the credit limit; collect the October dues first"
    },
    "type": "order.rejected",
    "tenantId": "aurum",
    "createdAt": "2026-10-21T19:56:46.068Z"
  },
  "order.settled": {
    "id": "evt_01M5G0K84JKCDE6E06KZ6PK0ZX",
    "data": {
      "shop": {
        "id": "cmvij7zb200097de7b66mbahm",
        "name": "Sharma Jewellers"
      },
      "actor": {
        "id": "cmvij7za600047de7w0tu3ivx",
        "name": "Priya Mehta"
      },
      "agent": {
        "id": "cmvij7z9k00027de7ikoa9y4j",
        "name": "Rahul Verma"
      },
      "credit": {
        "asOf": "2026-10-21T19:56:46.098Z",
        "shopId": "cmvij7zb200097de7b66mbahm",
        "reasons": [
          "CREDIT_LIMIT"
        ],
        "overLimit": true,
        "exposurePaise": 290433510,
        "creditLimitPaise": 250000000,
        "orderAmountPaise": 0,
        "outstandingPaise": 263405006,
        "requiresApproval": true,
        "memoExposurePaise": 27028504,
        "availableCreditPaise": 0,
        "unsettledOrdersPaise": 183405006,
        "approvalThresholdPaise": 100000000,
        "projectedExposurePaise": 290433510,
        "openingOutstandingPaise": 80000000
      },
      "number": "ORD-2026-00039",
      "status": "CONFIRMED",
      "orderId": "cmvij9esk007i7de7lq2kl4xj",
      "visitId": "cmvij7zn1005c7de7awr9r5nv",
      "settledAt": "2026-10-21T19:56:46.090Z",
      "totalPaise": 92553122
    },
    "type": "order.settled",
    "tenantId": "aurum",
    "createdAt": "2026-10-21T19:56:46.099Z"
  },
  "ping": {
    "id": "evt_01M5G0K8BBVJ934D0K3DSN5ZZB",
    "data": {
      "actor": {
        "id": "cmvij7za600047de7w0tu3ivx",
        "name": "Priya Mehta"
      },
      "message": "Hello from JewelRoute 👋",
      "endpointId": "cmvij7zqn006v7de70g3yfyrz"
    },
    "type": "ping",
    "tenantId": "aurum",
    "createdAt": "2026-10-21T19:56:46.315Z"
  },
  "sample.custody_changed": {
    "id": "evt_01M5G0K7R7M0PH7DEHB0SHEQTE",
    "data": {
      "to": {
        "type": "SHOP",
        "shopId": "cmvij7zb200097de7b66mbahm"
      },
      "from": {
        "type": "AGENT",
        "agentId": "cmvij7z9k00027de7ikoa9y4j"
      },
      "actor": {
        "id": "cmvij7z9k00027de7ikoa9y4j",
        "name": "Rahul Verma"
      },
      "memoId": "cmvij9eyr008x7de7osd7reg9",
      "pieces": [
        {
          "id": "pc_01M5G0H6D207Z1TPD0GSME90NV",
          "seq": 3,
          "tagCode": "AJ-S-000121"
        },
        {
          "id": "pc_01M5G0H6D2A9W9ABXDSH7E4KEK",
          "seq": 3,
          "tagCode": "AJ-S-000123"
        },
        {
          "id": "pc_01M5G0H6D2C1JK7ZJP91X7D1ZN",
          "seq": 3,
          "tagCode": "AJ-S-000125"
        }
      ],
      "reason": "MEMO_HANDOVER",
      "toLabel": "Sharma Jewellers",
      "visitId": "cmvij7zn1005c7de7awr9r5nv",
      "fromLabel": "Rahul Verma",
      "memoNumber": "MEMO-2026-00013",
      "pieceCount": 3
    },
    "type": "sample.custody_changed",
    "tenantId": "aurum",
    "createdAt": "2026-10-21T19:56:45.722Z"
  },
  "visit.checked_in": {
    "id": "evt_01M5G0K7B1TWD17TZM6H8ZQFQ7",
    "data": {
      "lat": 28.6521694933525,
      "lng": 77.1907,
      "shop": {
        "id": "cmvij7zb200097de7b66mbahm",
        "name": "Sharma Jewellers"
      },
      "agent": {
        "id": "cmvij7z9k00027de7ikoa9y4j",
        "name": "Rahul Verma"
      },
      "radiusM": 100,
      "visitId": "cmvij7zn1005c7de7awr9r5nv",
      "accuracyM": 9,
      "checkInAt": "2026-10-21T19:56:45.278Z",
      "distanceM": 30,
      "verification": "VERIFIED"
    },
    "type": "visit.checked_in",
    "tenantId": "aurum",
    "createdAt": "2026-10-21T19:56:45.281Z"
  },
  "visit.completed": {
    "id": "evt_01M5G0K86QTD614HQV44XVS8SV",
    "data": {
      "shop": {
        "id": "cmvij7zb200097de7b66mbahm",
        "name": "Sharma Jewellers"
      },
      "agent": {
        "id": "cmvij7z9k00027de7ikoa9y4j",
        "name": "Rahul Verma"
      },
      "summary": "Booked the temple set; two pieces left on memo.",
      "visitId": "cmvij7zn1005c7de7awr9r5nv",
      "memoCount": 1,
      "orderCount": 5,
      "proofCount": 1,
      "completedAt": "2026-10-21T19:56:46.160Z",
      "memoValuePaise": 98196904,
      "ordersValuePaise": 550371140
    },
    "type": "visit.completed",
    "tenantId": "aurum",
    "createdAt": "2026-10-21T19:56:46.167Z"
  },
  "visit.proof_uploaded": {
    "id": "evt_01M5G0K7EKC3B8PXNYBY9QXY7F",
    "data": {
      "url": "https://<your-host>/api/v1/files/cmvij9epg00777de7wmtg8s5u",
      "shop": {
        "id": "cmvij7zb200097de7b66mbahm",
        "name": "Sharma Jewellers"
      },
      "agent": {
        "id": "cmvij7z9k00027de7ikoa9y4j",
        "name": "Rahul Verma"
      },
      "proofId": "cmvij9eq6007a7de7vjpsxsd0",
      "visitId": "cmvij7zn1005c7de7awr9r5nv",
      "sizeBytes": 248913,
      "contentType": "image/jpeg",
      "checksumSha256": "1ef7ff93fe10bc8cb9be0269de462e8a851999974eabee1077a0338dee42a8cc",
      "distanceFromCheckInM": 0
    },
    "type": "visit.proof_uploaded",
    "tenantId": "aurum",
    "createdAt": "2026-10-21T19:56:45.395Z"
  }
};
