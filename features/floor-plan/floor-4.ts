import type { FloorArea, FloorConfig } from "./types";

/** Developer-maintained map; coordinates use the corrected 1409 × 1290 image. */
const baseFloor4 = {
  "id": "floor-4",
  "name": "Fourth floor",
  "image": "/floor-plans/floor-4.jpeg",
  "width": 1409,
  "height": 1290,
  "areas": [
    {
      "id": "floor4-office01",
      "name": "Office 01",
      "kind": "office",
      "capacity": 12,
      "shape": {
        "type": "rect",
        "x": 153,
        "y": 80,
        "width": 146,
        "height": 260
      }
    },
    {
      "id": "floor4-office02",
      "name": "Office 02",
      "kind": "office",
      "capacity": 9,
      "shape": {
        "type": "rect",
        "x": 17,
        "y": 119,
        "width": 128,
        "height": 221
      }
    },
    {
      "id": "floor4-office03",
      "name": "Office 03",
      "kind": "office",
      "capacity": 7,
      "shape": {
        "type": "rect",
        "x": 152,
        "y": 424,
        "width": 180,
        "height": 139
      }
    },
    {
      "id": "floor4-office04",
      "name": "Office 04",
      "kind": "office",
      "capacity": 7,
      "shape": {
        "type": "rect",
        "x": 152,
        "y": 569,
        "width": 180,
        "height": 111
      }
    },
    {
      "id": "floor4-office05",
      "name": "Office 05",
      "kind": "office",
      "capacity": 7,
      "shape": {
        "type": "rect",
        "x": 152,
        "y": 687,
        "width": 180,
        "height": 159
      }
    },
    {
      "id": "floor4-office06",
      "name": "Office 06",
      "kind": "office",
      "capacity": 7,
      "shape": {
        "type": "rect",
        "x": 16,
        "y": 424,
        "width": 129,
        "height": 211
      }
    },
    {
      "id": "floor4-office07",
      "name": "Office 07",
      "kind": "office",
      "capacity": 7,
      "shape": {
        "type": "rect",
        "x": 16,
        "y": 642,
        "width": 129,
        "height": 204
      }
    },
    {
      "id": "floor4-office08",
      "name": "Office 08",
      "kind": "office",
      "capacity": 4,
      "shape": {
        "type": "rect",
        "x": 14,
        "y": 935,
        "width": 80,
        "height": 214
      }
    },
    {
      "id": "floor4-office09",
      "name": "Office 09",
      "kind": "office",
      "capacity": 8,
      "shape": {
        "type": "rect",
        "x": 100,
        "y": 935,
        "width": 123,
        "height": 193
      }
    },
    {
      "id": "floor4-office10",
      "name": "Office 10",
      "kind": "office",
      "capacity": 2,
      "shape": {
        "type": "rect",
        "x": 230,
        "y": 935,
        "width": 102,
        "height": 68
      }
    },
    {
      "id": "floor4-office11",
      "name": "Office 11",
      "kind": "office",
      "capacity": 2,
      "shape": {
        "type": "rect",
        "x": 230,
        "y": 1010,
        "width": 102,
        "height": 118
      }
    },
    {
      "id": "floor4-office12",
      "name": "Office 12",
      "kind": "office",
      "capacity": 4,
      "shape": {
        "type": "rect",
        "x": 419,
        "y": 1046,
        "width": 110,
        "height": 145
      }
    },
    {
      "id": "floor4-office13",
      "name": "Office 13",
      "kind": "office",
      "capacity": 2,
      "shape": {
        "type": "rect",
        "x": 535,
        "y": 1046,
        "width": 77,
        "height": 110
      }
    },
    {
      "id": "floor4-office14",
      "name": "Office 14",
      "kind": "office",
      "capacity": 5,
      "shape": {
        "type": "rect",
        "x": 468,
        "y": 824,
        "width": 73,
        "height": 137
      }
    },
    {
      "id": "floor4-office15",
      "name": "Office 15",
      "kind": "office",
      "capacity": 5,
      "shape": {
        "type": "rect",
        "x": 735,
        "y": 824,
        "width": 71,
        "height": 137
      }
    },
    {
      "id": "floor4-office16",
      "name": "Office 16",
      "kind": "office",
      "capacity": 2,
      "shape": {
        "type": "rect",
        "x": 816,
        "y": 895,
        "width": 104,
        "height": 66
      }
    },
    {
      "id": "floor4-office17",
      "name": "Office 17",
      "kind": "office",
      "capacity": 2,
      "shape": {
        "type": "rect",
        "x": 816,
        "y": 824,
        "width": 104,
        "height": 65
      }
    },
    {
      "id": "floor4-office18",
      "name": "Office 18",
      "kind": "office",
      "capacity": 11,
      "shape": {
        "type": "rect",
        "x": 1005,
        "y": 641,
        "width": 281,
        "height": 133
      }
    },
    {
      "id": "floor4-office19",
      "name": "Office 19",
      "kind": "office",
      "capacity": 10,
      "shape": {
        "type": "rect",
        "x": 1005,
        "y": 470,
        "width": 281,
        "height": 164
      }
    },
    {
      "id": "floor4-office20",
      "name": "Office 20",
      "kind": "office",
      "capacity": 24,
      "shape": {
        "type": "polygon",
        "points": [
          [
            1287,
            234
          ],
          [
            1287,
            452
          ],
          [
            1008,
            452
          ],
          [
            1008,
            81
          ],
          [
            1155,
            81
          ],
          [
            1155,
            234
          ]
        ]
      }
    },
    {
      "id": "floor4-cabin02",
      "name": "Cabin 02",
      "kind": "cabin",
      "capacity": null,
      "shape": {
        "type": "polygon",
        "points": [
          [
            1235,
            82
          ],
          [
            1285,
            134
          ],
          [
            1285,
            227
          ],
          [
            1161,
            227
          ],
          [
            1161,
            82
          ]
        ]
      }
    },
    {
      "id": "floor4-meeting01",
      "name": "Meeting room 01",
      "kind": "meeting",
      "capacity": null,
      "shape": {
        "type": "rect",
        "x": 794,
        "y": 81,
        "width": 202,
        "height": 132
      }
    },
    {
      "id": "floor4-meeting02",
      "name": "Meeting room 02",
      "kind": "meeting",
      "capacity": null,
      "shape": {
        "type": "rect",
        "x": 550,
        "y": 824,
        "width": 178,
        "height": 137
      }
    },
    {
      "id": "floor4-huddle01",
      "name": "Huddle room 01",
      "kind": "huddle",
      "capacity": null,
      "shape": {
        "type": "polygon",
        "points": [
          [
            993,
            220
          ],
          [
            993,
            451
          ],
          [
            811,
            451
          ],
          [
            811,
            220
          ]
        ]
      }
    },
    {
      "id": "floor4-huddle02",
      "name": "Huddle room 02",
      "kind": "huddle",
      "capacity": null,
      "shape": {
        "type": "polygon",
        "points": [
          [
            540,
            328
          ],
          [
            540,
            450
          ],
          [
            420,
            450
          ],
          [
            420,
            328
          ]
        ]
      }
    },
    {
      "id": "floor4-phone01",
      "name": "Phone booth 01",
      "kind": "phone",
      "capacity": 1,
      "shape": {
        "type": "rect",
        "x": 421,
        "y": 824,
        "width": 39,
        "height": 41
      }
    },
    {
      "id": "floor4-phone02",
      "name": "Phone booth 02",
      "kind": "phone",
      "capacity": 1,
      "shape": {
        "type": "rect",
        "x": 421,
        "y": 872,
        "width": 39,
        "height": 41
      }
    },
    {
      "id": "floor4-phone03",
      "name": "Phone booth 03",
      "kind": "phone",
      "capacity": 1,
      "shape": {
        "type": "rect",
        "x": 421,
        "y": 920,
        "width": 39,
        "height": 41
      }
    },
    {
      "id": "floor4-cafeteria",
      "name": "Cafeteria",
      "kind": "amenity",
      "capacity": 16,
      "shape": {
        "type": "rect",
        "x": 1006,
        "y": 797,
        "width": 280,
        "height": 179
      }
    },
    {
      "id": "floor4-pantry",
      "name": "Pantry",
      "kind": "amenity",
      "capacity": null,
      "shape": {
        "type": "rect",
        "x": 1005,
        "y": 1047,
        "width": 113,
        "height": 148
      }
    },
    {
      "id": "floor4-reception",
      "name": "Reception",
      "kind": "amenity",
      "capacity": null,
      "shape": {
        "type": "rect",
        "x": 551,
        "y": 233,
        "width": 231,
        "height": 219
      }
    },
    {
      "id": "floor4-seat01",
      "name": "Shared seat 01",
      "kind": "seat",
      "capacity": 1,
      "shape": {
        "type": "circle",
        "cx": 923,
        "cy": 550,
        "r": 12
      }
    },
    {
      "id": "floor4-seat02",
      "name": "Shared seat 02",
      "kind": "seat",
      "capacity": 1,
      "shape": {
        "type": "circle",
        "cx": 923,
        "cy": 590,
        "r": 12
      }
    },
    {
      "id": "floor4-seat03",
      "name": "Shared seat 03",
      "kind": "seat",
      "capacity": 1,
      "shape": {
        "type": "circle",
        "cx": 815,
        "cy": 550,
        "r": 12
      }
    },
    {
      "id": "floor4-seat04",
      "name": "Shared seat 04",
      "kind": "seat",
      "capacity": 1,
      "shape": {
        "type": "circle",
        "cx": 815,
        "cy": 590,
        "r": 12
      }
    },
    {
      "id": "floor4-seat05",
      "name": "Shared seat 05",
      "kind": "seat",
      "capacity": 1,
      "shape": {
        "type": "circle",
        "cx": 889,
        "cy": 532,
        "r": 12
      }
    },
    {
      "id": "floor4-seat06",
      "name": "Shared seat 06",
      "kind": "seat",
      "capacity": 1,
      "shape": {
        "type": "circle",
        "cx": 844,
        "cy": 532,
        "r": 12
      }
    },
    {
      "id": "floor4-seat07",
      "name": "Shared seat 07",
      "kind": "seat",
      "capacity": 1,
      "shape": {
        "type": "circle",
        "cx": 889,
        "cy": 608,
        "r": 12
      }
    },
    {
      "id": "floor4-seat08",
      "name": "Shared seat 08",
      "kind": "seat",
      "capacity": 1,
      "shape": {
        "type": "circle",
        "cx": 844,
        "cy": 608,
        "r": 12
      }
    },
    {
      "id": "floor4-seat09",
      "name": "Shared seat 09",
      "kind": "seat",
      "capacity": 1,
      "shape": {
        "type": "circle",
        "cx": 923,
        "cy": 680,
        "r": 12
      }
    },
    {
      "id": "floor4-seat10",
      "name": "Shared seat 10",
      "kind": "seat",
      "capacity": 1,
      "shape": {
        "type": "circle",
        "cx": 923,
        "cy": 720,
        "r": 12
      }
    },
    {
      "id": "floor4-seat11",
      "name": "Shared seat 11",
      "kind": "seat",
      "capacity": 1,
      "shape": {
        "type": "circle",
        "cx": 815,
        "cy": 680,
        "r": 12
      }
    },
    {
      "id": "floor4-seat12",
      "name": "Shared seat 12",
      "kind": "seat",
      "capacity": 1,
      "shape": {
        "type": "circle",
        "cx": 815,
        "cy": 720,
        "r": 12
      }
    },
    {
      "id": "floor4-seat13",
      "name": "Shared seat 13",
      "kind": "seat",
      "capacity": 1,
      "shape": {
        "type": "circle",
        "cx": 889,
        "cy": 662,
        "r": 12
      }
    },
    {
      "id": "floor4-seat14",
      "name": "Shared seat 14",
      "kind": "seat",
      "capacity": 1,
      "shape": {
        "type": "circle",
        "cx": 844,
        "cy": 662,
        "r": 12
      }
    },
    {
      "id": "floor4-seat15",
      "name": "Shared seat 15",
      "kind": "seat",
      "capacity": 1,
      "shape": {
        "type": "circle",
        "cx": 889,
        "cy": 738,
        "r": 12
      }
    },
    {
      "id": "floor4-seat16",
      "name": "Shared seat 16",
      "kind": "seat",
      "capacity": 1,
      "shape": {
        "type": "circle",
        "cx": 844,
        "cy": 738,
        "r": 12
      }
    },
    {
      "id": "floor4-seat17",
      "name": "Shared seat 17",
      "kind": "seat",
      "capacity": 1,
      "shape": {
        "type": "circle",
        "cx": 527,
        "cy": 550,
        "r": 12
      }
    },
    {
      "id": "floor4-seat18",
      "name": "Shared seat 18",
      "kind": "seat",
      "capacity": 1,
      "shape": {
        "type": "circle",
        "cx": 527,
        "cy": 590,
        "r": 12
      }
    },
    {
      "id": "floor4-seat19",
      "name": "Shared seat 19",
      "kind": "seat",
      "capacity": 1,
      "shape": {
        "type": "circle",
        "cx": 419,
        "cy": 550,
        "r": 12
      }
    },
    {
      "id": "floor4-seat20",
      "name": "Shared seat 20",
      "kind": "seat",
      "capacity": 1,
      "shape": {
        "type": "circle",
        "cx": 419,
        "cy": 590,
        "r": 12
      }
    },
    {
      "id": "floor4-seat21",
      "name": "Shared seat 21",
      "kind": "seat",
      "capacity": 1,
      "shape": {
        "type": "circle",
        "cx": 493,
        "cy": 532,
        "r": 12
      }
    },
    {
      "id": "floor4-seat22",
      "name": "Shared seat 22",
      "kind": "seat",
      "capacity": 1,
      "shape": {
        "type": "circle",
        "cx": 448,
        "cy": 532,
        "r": 12
      }
    },
    {
      "id": "floor4-seat23",
      "name": "Shared seat 23",
      "kind": "seat",
      "capacity": 1,
      "shape": {
        "type": "circle",
        "cx": 493,
        "cy": 608,
        "r": 12
      }
    },
    {
      "id": "floor4-seat24",
      "name": "Shared seat 24",
      "kind": "seat",
      "capacity": 1,
      "shape": {
        "type": "circle",
        "cx": 448,
        "cy": 608,
        "r": 12
      }
    },
    {
      "id": "floor4-seat25",
      "name": "Shared seat 25",
      "kind": "seat",
      "capacity": 1,
      "shape": {
        "type": "circle",
        "cx": 527,
        "cy": 680,
        "r": 12
      }
    },
    {
      "id": "floor4-seat26",
      "name": "Shared seat 26",
      "kind": "seat",
      "capacity": 1,
      "shape": {
        "type": "circle",
        "cx": 527,
        "cy": 720,
        "r": 12
      }
    },
    {
      "id": "floor4-seat27",
      "name": "Shared seat 27",
      "kind": "seat",
      "capacity": 1,
      "shape": {
        "type": "circle",
        "cx": 419,
        "cy": 680,
        "r": 12
      }
    },
    {
      "id": "floor4-seat28",
      "name": "Shared seat 28",
      "kind": "seat",
      "capacity": 1,
      "shape": {
        "type": "circle",
        "cx": 419,
        "cy": 720,
        "r": 12
      }
    },
    {
      "id": "floor4-seat29",
      "name": "Shared seat 29",
      "kind": "seat",
      "capacity": 1,
      "shape": {
        "type": "circle",
        "cx": 493,
        "cy": 662,
        "r": 12
      }
    },
    {
      "id": "floor4-seat30",
      "name": "Shared seat 30",
      "kind": "seat",
      "capacity": 1,
      "shape": {
        "type": "circle",
        "cx": 448,
        "cy": 662,
        "r": 12
      }
    },
    {
      "id": "floor4-seat31",
      "name": "Shared seat 31",
      "kind": "seat",
      "capacity": 1,
      "shape": {
        "type": "circle",
        "cx": 493,
        "cy": 738,
        "r": 12
      }
    },
    {
      "id": "floor4-seat32",
      "name": "Shared seat 32",
      "kind": "seat",
      "capacity": 1,
      "shape": {
        "type": "circle",
        "cx": 448,
        "cy": 738,
        "r": 12
      }
    }
  ]
} satisfies FloorConfig;

// The red-marked blocks in the supplied review image are not seats. The green-marked
// central row is the actual shared-seat area, so only those five seats are exposed here.
const centralSeats: FloorArea[] = [
  { id: "floor4-central-seat01", name: "Central seat 01", kind: "seat", capacity: 1, shape: { type: "rect", x: 552, y: 748, width: 40, height: 42 } },
  { id: "floor4-central-seat02", name: "Central seat 02", kind: "seat", capacity: 1, shape: { type: "rect", x: 600, y: 748, width: 40, height: 42 } },
  { id: "floor4-central-seat03", name: "Central seat 03", kind: "seat", capacity: 1, shape: { type: "rect", x: 648, y: 748, width: 40, height: 42 } },
  { id: "floor4-central-seat04", name: "Central seat 04", kind: "seat", capacity: 1, shape: { type: "rect", x: 696, y: 748, width: 40, height: 42 } },
  { id: "floor4-central-seat05", name: "Central seat 05", kind: "seat", capacity: 1, shape: { type: "rect", x: 744, y: 748, width: 40, height: 42 } },
];

// Additional chair cluster from the supplied reference: two columns with four chairs each.
const additionalChairCluster: FloorArea[] = [
  { id: "floor4-chair-cluster01", name: "Shared chair 01", kind: "seat", capacity: 1, shape: { type: "circle", cx: 448, cy: 532, r: 14 } },
  { id: "floor4-chair-cluster02", name: "Shared chair 02", kind: "seat", capacity: 1, shape: { type: "circle", cx: 493, cy: 532, r: 14 } },
  { id: "floor4-chair-cluster03", name: "Shared chair 03", kind: "seat", capacity: 1, shape: { type: "circle", cx: 448, cy: 608, r: 14 } },
  { id: "floor4-chair-cluster04", name: "Shared chair 04", kind: "seat", capacity: 1, shape: { type: "circle", cx: 493, cy: 608, r: 14 } },
  { id: "floor4-chair-cluster05", name: "Shared chair 05", kind: "seat", capacity: 1, shape: { type: "circle", cx: 448, cy: 662, r: 14 } },
  { id: "floor4-chair-cluster06", name: "Shared chair 06", kind: "seat", capacity: 1, shape: { type: "circle", cx: 493, cy: 662, r: 14 } },
  { id: "floor4-chair-cluster07", name: "Shared chair 07", kind: "seat", capacity: 1, shape: { type: "circle", cx: 448, cy: 738, r: 14 } },
  { id: "floor4-chair-cluster08", name: "Shared chair 08", kind: "seat", capacity: 1, shape: { type: "circle", cx: 493, cy: 738, r: 14 } },
];

// Matching chair cluster on the opposite side of the central space.
const oppositeChairCluster: FloorArea[] = [
  { id: "floor4-opposite-chair01", name: "Shared chair 09", kind: "seat", capacity: 1, shape: { type: "circle", cx: 844, cy: 532, r: 14 } },
  { id: "floor4-opposite-chair02", name: "Shared chair 10", kind: "seat", capacity: 1, shape: { type: "circle", cx: 889, cy: 532, r: 14 } },
  { id: "floor4-opposite-chair03", name: "Shared chair 11", kind: "seat", capacity: 1, shape: { type: "circle", cx: 844, cy: 608, r: 14 } },
  { id: "floor4-opposite-chair04", name: "Shared chair 12", kind: "seat", capacity: 1, shape: { type: "circle", cx: 889, cy: 608, r: 14 } },
  { id: "floor4-opposite-chair05", name: "Shared chair 13", kind: "seat", capacity: 1, shape: { type: "circle", cx: 844, cy: 662, r: 14 } },
  { id: "floor4-opposite-chair06", name: "Shared chair 14", kind: "seat", capacity: 1, shape: { type: "circle", cx: 889, cy: 662, r: 14 } },
  { id: "floor4-opposite-chair07", name: "Shared chair 15", kind: "seat", capacity: 1, shape: { type: "circle", cx: 844, cy: 738, r: 14 } },
  { id: "floor4-opposite-chair08", name: "Shared chair 16", kind: "seat", capacity: 1, shape: { type: "circle", cx: 889, cy: 738, r: 14 } },
];

export const floor4: FloorConfig = {
  ...baseFloor4,
  areas: (baseFloor4.areas as FloorArea[]).filter((area) => !area.id.startsWith("floor4-seat")).concat(centralSeats, additionalChairCluster, oppositeChairCluster),
};
