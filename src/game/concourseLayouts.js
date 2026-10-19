// Approved angles, scales and desktop/phone placements (2026-10-19).
// Positions use the station scene below the header; rotations are XYZ degrees.
const freeze=value=>{for(const child of Object.values(value))if(child&&typeof child==='object')freeze(child);return Object.freeze(value);};
export const CONCOURSE_LAYOUTS=freeze({
 "helix": {
  "scale": 1.5444,
  "rotationDeg": {
   "yaw": 30,
   "pitch": 3,
   "roll": 6
  },
  "placements": {
   "desktop": {
    "ship": {
     "x": 0.75492,
     "y": 0.70402,
     "zoom": 1
    },
    "buttons": {
     "services": {
      "x": 0.53243,
      "y": 0.34419
     },
     "market": {
      "x": 0.28991,
      "y": 0.33897
     },
     "bar": {
      "x": 0.1183,
      "y": 0.65243
     },
     "den": {
      "x": 0.3771,
      "y": 0.75217
     }
    }
   },
   "phone": {
    "ship": {
     "x": 0.74105,
     "y": 0.73968,
     "zoom": 1
    },
    "buttons": {
     "services": {
      "x": 0.4158767772511848,
      "y": 0.40963855421686746
     },
     "market": {
      "x": 0.19137848045023698,
      "y": 0.45745481927710846
     },
     "bar": {
      "x": 0.16745964158767773,
      "y": 0.18392319277108435
     },
     "den": {
      "x": 0.3927725118483412,
      "y": 0.8192771084337349
     }
    }
   }
  }
 },
 "rook": {
  "scale": 1.3696,
  "rotationDeg": {
   "yaw": -104,
   "pitch": 0,
   "roll": -4
  },
  "placements": {
   "desktop": {
    "ship": {
     "x": 0.5056,
     "y": 0.74535,
     "zoom": 1
    },
    "buttons": {
     "services": {
      "x": 0.65668,
      "y": 0.52426
     },
     "market": {
      "x": 0.11804,
      "y": 0.65906
     },
     "bar": {
      "x": 0.14919,
      "y": 0.29132
     },
     "den": {
      "x": 0.79833,
      "y": 0.82636
     }
    }
   },
   "phone": {
    "ship": {
     "x": 0.50338,
     "y": 0.80881,
     "zoom": 1
    },
    "buttons": {
     "services": {
      "x": 0.5609,
      "y": 0.15584
     },
     "market": {
      "x": 0.07962,
      "y": 0.75624
     },
     "bar": {
      "x": 0.18336,
      "y": 0.10006
     },
     "den": {
      "x": 0.73704,
      "y": 0.71461
     }
    }
   }
  }
 },
 "vesper": {
  "scale": 1.254,
  "rotationDeg": {
   "yaw": 34,
   "pitch": 0,
   "roll": 8
  },
  "placements": {
   "phone": {
    "ship": {
     "x": 0.53071,
     "y": 0.63552,
     "zoom": 1
    },
    "buttons": {
     "services": {
      "x": 0.32011,
      "y": 0.77676
     },
     "market": {
      "x": 0.07494,
      "y": 0.52688
     },
     "bar": {
      "x": 0.73692,
      "y": 0.58213
     },
     "den": {
      "x": 0.7855450236966824,
      "y": 0.8192771084337349
     }
    }
   },
   "desktop": {
    "ship": {
     "x": 0.52147,
     "y": 0.62537,
     "zoom": 1
    },
    "buttons": {
     "services": {
      "x": 0.26976,
      "y": 0.77883
     },
     "market": {
      "x": 0.07928,
      "y": 0.55246
     },
     "bar": {
      "x": 0.77378,
      "y": 0.57838
     },
     "den": {
      "x": 0.82943,
      "y": 0.88589
     }
    }
   }
  }
 },
 "azure": {
  "scale": 1.104,
  "rotationDeg": {
   "yaw": 42,
   "pitch": 0,
   "roll": 6
  },
  "placements": {
   "phone": {
    "ship": {
     "x": 0.35286,
     "y": 0.63357,
     "zoom": 1
    },
    "buttons": {
     "services": {
      "x": 0.53576,
      "y": 0.74101
     },
     "market": {
      "x": 0.7715214010663507,
      "y": 0.22952748493975902
     },
     "bar": {
      "x": 0.21037,
      "y": 0.06464
     },
     "den": {
      "x": 0.06655,
      "y": 0.73974
     }
    }
   },
   "desktop": {
    "ship": {
     "x": 0.345,
     "y": 0.62634,
     "zoom": 1
    },
    "buttons": {
     "services": {
      "x": 0.61001,
      "y": 0.67729
     },
     "market": {
      "x": 0.78356,
      "y": 0.32713
     },
     "bar": {
      "x": 0.17655,
      "y": 0.25974
     },
     "den": {
      "x": 0.21798,
      "y": 0.77401
     }
    }
   }
  }
 },
 "haven": {
  "scale": 1.7152,
  "rotationDeg": {
   "yaw": -108,
   "pitch": 0,
   "roll": -6
  },
  "placements": {
   "phone": {
    "ship": {
     "x": 0.5071738003554502,
     "y": 0.7899802334337349,
     "zoom": 1
    },
    "buttons": {
     "services": {
      "x": 0.59351,
      "y": 0.80204
     },
     "market": {
      "x": 0.07727,
      "y": 0.56376
     },
     "bar": {
      "x": 0.52781,
      "y": 0.20748
     },
     "den": {
      "x": 0.79477,
      "y": 0.56719
     }
    }
   },
   "desktop": {
    "ship": {
     "x": 0.5079698350694445,
     "y": 0.7693223468976443,
     "zoom": 1
    },
    "buttons": {
     "services": {
      "x": 0.64568,
      "y": 0.75825
     },
     "market": {
      "x": 0.09232,
      "y": 0.60244
     },
     "bar": {
      "x": 0.55181,
      "y": 0.3305
     },
     "den": {
      "x": 0.82719,
      "y": 0.60161
     }
    }
   }
  }
 },
 "league-yard": {
  "scale": 1.7484,
  "rotationDeg": {
   "yaw": -8,
   "pitch": 4,
   "roll": 0
  },
  "placements": {
   "phone": {
    "ship": {
     "x": 0.47861,
     "y": 0.92763,
     "zoom": 1.34
    },
    "buttons": {
     "services": {
      "x": 0.14484,
      "y": 0.71651
     },
     "market": {
      "x": 0.4185,
      "y": 0.1027
     },
     "bar": {
      "x": 0.77072,
      "y": 0.28789
     },
     "den": {
      "x": 0.7855450236966824,
      "y": 0.8192771084337349
     }
    }
   },
   "desktop": {
    "ship": {
     "x": 0.45793,
     "y": 0.94652,
     "zoom": 1.37
    },
    "buttons": {
     "services": {
      "x": 0.09144,
      "y": 0.79749
     },
     "market": {
      "x": 0.32559,
      "y": 0.36923
     },
     "bar": {
      "x": 0.81387,
      "y": 0.38611
     },
     "den": {
      "x": 0.80429,
      "y": 0.81581
     }
    }
   }
  }
 },
 "cinderfall": {
  "scale": 1.7952,
  "rotationDeg": {
   "yaw": -111,
   "pitch": 0,
   "roll": -4
  },
  "placements": {
   "phone": {
    "ship": {
     "x": 0.5083678909952607,
     "y": 0.7899802334337349,
     "zoom": 1
    },
    "buttons": {
     "services": {
      "x": 0.69102,
      "y": 0.75312
     },
     "market": {
      "x": 0.09903,
      "y": 0.62942
     },
     "bar": {
      "x": 0.79921,
      "y": 0.1823
     },
     "den": {
      "x": 0.24775,
      "y": 0.03398
     }
    }
   },
   "desktop": {
    "ship": {
     "x": 0.5093044704861112,
     "y": 0.8381844258837425,
     "zoom": 1
    },
    "buttons": {
     "services": {
      "x": 0.71302,
      "y": 0.82795
     },
     "market": {
      "x": 0.12531,
      "y": 0.67659
     },
     "bar": {
      "x": 0.66234,
      "y": 0.3545
     },
     "den": {
      "x": 0.29515,
      "y": 0.2552
     }
    }
   }
  }
 },
 "cairn": {
  "scale": 2.5456,
  "rotationDeg": {
   "yaw": -93,
   "pitch": 0,
   "roll": 0
  },
  "placements": {
   "phone": {
    "ship": {
     "x": 0.4605209567535545,
     "y": 0.7899802334337349,
     "zoom": 1
    },
    "buttons": {
     "services": {
      "x": 0.74215,
      "y": 0.54938
     },
     "bar": {
      "x": 0.26056,
      "y": 0.10722
     },
     "den": {
      "x": 0.03885,
      "y": 0.69803
     }
    }
   },
   "desktop": {
    "ship": {
     "x": 0.4561360677083333,
     "y": 0.7463745699635348,
     "zoom": 1
    },
    "buttons": {
     "services": {
      "x": 0.75333,
      "y": 0.56099
     },
     "bar": {
      "x": 0.14088,
      "y": 0.12448
     },
     "den": {
      "x": 0.03196,
      "y": 0.60368
     }
    }
   }
  }
 },
 "meridian-prime": {
  "scale": 2.324,
  "rotationDeg": {
   "yaw": 75,
   "pitch": 0,
   "roll": 5
  },
  "placements": {
   "phone": {
    "ship": {
     "x": 0.26886,
     "y": 0.85632,
     "zoom": 1
    },
    "buttons": {
     "services": {
      "x": 0.43126,
      "y": 0.76645
     },
     "market": {
      "x": 0.76746,
      "y": 0.17643
     },
     "bar": {
      "x": 0.27714,
      "y": 0.11408
     },
     "den": {
      "x": 0.75565,
      "y": 0.73411
     }
    }
   },
   "desktop": {
    "ship": {
     "x": 0.25984,
     "y": 0.80899,
     "zoom": 0.9095106229990207
    },
    "buttons": {
     "services": {
      "x": 0.36357,
      "y": 0.78525
     },
     "market": {
      "x": 0.8047,
      "y": 0.32124
     },
     "bar": {
      "x": 0.27693,
      "y": 0.32224
     },
     "den": {
      "x": 0.78749,
      "y": 0.70934
     }
    }
   }
  }
 },
 "argent": {
  "scale": 1.9458,
  "rotationDeg": {
   "yaw": 18,
   "pitch": 0,
   "roll": 3
  },
  "placements": {
   "phone": {
    "ship": {
     "x": 0.52019,
     "y": 0.82312,
     "zoom": 1
    },
    "buttons": {
     "services": {
      "x": 0.13865,
      "y": 0.73086
     },
     "market": {
      "x": 0.78781,
      "y": 0.72519
     },
     "bar": {
      "x": 0.45254,
      "y": 0.04663
     },
     "den": {
      "x": 0.57184,
      "y": 0.32142
     }
    }
   },
   "desktop": {
    "ship": {
     "x": 0.53269,
     "y": 0.77083,
     "zoom": 1
    },
    "buttons": {
     "services": {
      "x": 0.17072,
      "y": 0.72157
     },
     "market": {
      "x": 0.81733,
      "y": 0.67321
     },
     "bar": {
      "x": 0.40173,
      "y": 0.1761
     },
     "den": {
      "x": 0.61895,
      "y": 0.39911
     }
    }
   }
  }
 },
 "gatehouse-twelve": {
  "scale": 2.288,
  "rotationDeg": {
   "yaw": 89,
   "pitch": 0,
   "roll": 3
  },
  "placements": {
   "phone": {
    "ship": {
     "x": 0.34464,
     "y": 0.8233,
     "zoom": 1
    },
    "buttons": {
     "services": {
      "x": 0.49805,
      "y": 0.76018
     },
     "bar": {
      "x": 0.63605,
      "y": 0.03159
     },
     "den": {
      "x": 0.7797,
      "y": 0.62041
     }
    }
   },
   "desktop": {
    "ship": {
     "x": 0.32634,
     "y": 0.78339,
     "zoom": 1
    },
    "buttons": {
     "services": {
      "x": 0.50724,
      "y": 0.74145
     },
     "bar": {
      "x": 0.67897,
      "y": 0.20705
     },
     "den": {
      "x": 0.82861,
      "y": 0.63995
     }
    }
   }
  }
 },
 "blackglass": {
  "scale": 1.8875,
  "rotationDeg": {
   "yaw": 71,
   "pitch": 0,
   "roll": 1
  },
  "placements": {
   "phone": {
    "ship": {
     "x": 0.25085,
     "y": 0.88491,
     "zoom": 1
    },
    "buttons": {
     "services": {
      "x": 0.04448,
      "y": 0.41554
     },
     "market": {
      "x": 0.58419,
      "y": 0.60608
     },
     "bar": {
      "x": 0.41285,
      "y": 0.05625
     },
     "den": {
      "x": 0.81085,
      "y": 0.43314
     }
    }
   },
   "desktop": {
    "ship": {
     "x": 0.2301,
     "y": 0.83073,
     "zoom": 0.8619206323253693
    },
    "buttons": {
     "services": {
      "x": 0.02428,
      "y": 0.55472
     },
     "market": {
      "x": 0.65416,
      "y": 0.62436
     },
     "bar": {
      "x": 0.40248,
      "y": 0.15495
     },
     "den": {
      "x": 0.82652,
      "y": 0.85003
     }
    }
   }
  }
 },
 "cinder": {
  "scale": 1.54,
  "rotationDeg": {
   "yaw": 85,
   "pitch": 0,
   "roll": 3
  },
  "placements": {
   "phone": {
    "ship": {
     "x": 0.6288,
     "y": 0.82441,
     "zoom": 1
    },
    "buttons": {
     "services": {
      "x": 0.76839,
      "y": 0.73159
     },
     "market": {
      "x": 0.08448,
      "y": 0.80982
     },
     "bar": {
      "x": 0.28843,
      "y": 0.26861
     },
     "den": {
      "x": 0.50946,
      "y": 0.26848
     }
    }
   },
   "desktop": {
    "ship": {
     "x": 0.64582,
     "y": 0.77348,
     "zoom": 1
    },
    "buttons": {
     "services": {
      "x": 0.78236,
      "y": 0.69412
     },
     "market": {
      "x": 0.04461,
      "y": 0.79171
     },
     "bar": {
      "x": 0.28999,
      "y": 0.35554
     },
     "den": {
      "x": 0.50154,
      "y": 0.41807
     }
    }
   }
  }
 },
 "torchwell": {
  "scale": 1.32,
  "rotationDeg": {
   "yaw": -98,
   "pitch": 0,
   "roll": 0
  },
  "placements": {
   "phone": {
    "ship": {
     "x": 0.50451,
     "y": 0.77546,
     "zoom": 1
    },
    "buttons": {
     "services": {
      "x": 0.63066,
      "y": 0.60601
     },
     "bar": {
      "x": 0.5848,
      "y": 0.23923
     },
     "den": {
      "x": 0.07512,
      "y": 0.65517
     }
    }
   },
   "desktop": {
    "ship": {
     "x": 0.49,
     "y": 0.72966,
     "zoom": 1
    },
    "buttons": {
     "services": {
      "x": 0.61731,
      "y": 0.69832
     },
     "bar": {
      "x": 0.55925,
      "y": 0.31307
     },
     "den": {
      "x": 0.14237,
      "y": 0.63503
     }
    }
   }
  }
 },
 "nacre": {
  "scale": 1.6632,
  "rotationDeg": {
   "yaw": 81,
   "pitch": 0,
   "roll": 3
  },
  "placements": {
   "phone": {
    "ship": {
     "x": 0.26763,
     "y": 0.77657,
     "zoom": 1
    },
    "buttons": {
     "services": {
      "x": 0.38018,
      "y": 0.74212
     },
     "market": {
      "x": 0.12071,
      "y": 0.02471
     },
     "bar": {
      "x": 0.65204,
      "y": 0.4625
     },
     "den": {
      "x": 0.73706,
      "y": 0.77341
     }
    }
   },
   "desktop": {
    "ship": {
     "x": 0.24325,
     "y": 0.72576,
     "zoom": 0.9347047579139812
    },
    "buttons": {
     "services": {
      "x": 0.36568,
      "y": 0.70854
     },
     "market": {
      "x": 0.08987,
      "y": 0.18651
     },
     "bar": {
      "x": 0.64497,
      "y": 0.53716
     },
     "den": {
      "x": 0.29216,
      "y": 0.90058
     }
    }
   }
  }
 },
 "boreal": {
  "scale": 1.242,
  "rotationDeg": {
   "yaw": -149,
   "pitch": 3,
   "roll": -2
  },
  "placements": {
   "phone": {
    "ship": {
     "x": 0.74465,
     "y": 0.8344,
     "zoom": 1
    },
    "buttons": {
     "services": {
      "x": 0.43544,
      "y": 0.7639
     },
     "market": {
      "x": 0.08301,
      "y": 0.77496
     },
     "bar": {
      "x": 0.37879,
      "y": 0.30146
     },
     "den": {
      "x": 0.69828,
      "y": 0.3868
     }
    }
   },
   "desktop": {
    "ship": {
     "x": 0.75859,
     "y": 0.8219,
     "zoom": 1
    },
    "buttons": {
     "services": {
      "x": 0.48294,
      "y": 0.80633
     },
     "market": {
      "x": 0.11362,
      "y": 0.77316
     },
     "bar": {
      "x": 0.3519,
      "y": 0.46159
     },
     "den": {
      "x": 0.72098,
      "y": 0.4853
     }
    }
   }
  }
 },
 "shepherd": {
  "scale": 1.1016,
  "rotationDeg": {
   "yaw": 88,
   "pitch": 0,
   "roll": 0
  },
  "placements": {
   "phone": {
    "ship": {
     "x": 0.30322,
     "y": 0.75198,
     "zoom": 1
    },
    "buttons": {
     "services": {
      "x": 0.03264,
      "y": 0.72042
     },
     "bar": {
      "x": 0.30438,
      "y": 0.10541
     },
     "den": {
      "x": 0.4702,
      "y": 0.5789
     }
    }
   },
   "desktop": {
    "ship": {
     "x": 0.29196,
     "y": 0.7093,
     "zoom": 1
    },
    "buttons": {
     "services": {
      "x": 0.37643,
      "y": 0.72393
     },
     "bar": {
      "x": 0.27913,
      "y": 0.25169
     },
     "den": {
      "x": 0.45587,
      "y": 0.49855
     }
    }
   }
  }
 }
});
