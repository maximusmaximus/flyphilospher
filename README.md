# flyphilospher

A fruit fly on a stone pedestal, facing a double-sided mirror, in a quiet
liminal space. Drag to orbit. Pinch or scroll to lean in. The fly walks, inspects
its reflection, and takes off when you loom in — its wings buzz in space around
you.

## The brain

The body is driven by a **connected subgraph of MaleCNS v1.0**, the complete
male *Drosophila* central nervous system released by HHMI Janelia FlyEM, Google
Research, the University of Cambridge, and MRC LMB (Berg et al., *Cell* 2026,
CC-BY).

`public/connectome/malecns-core.json` is extracted from the official tables:

- `body-annotations-male-cns-v1.0-minconf-0.5.feather`
- `body-neurotransmitters-male-cns-v1.0.feather`
- `connectome-weights-male-cns-v1.0-minconf-0.5.feather`

grown upstream from giant fiber **DNp01**, flight steering **DNg02**, walking
descending neurons, and wing / leg / neck / haltere motor neurons, plus lamina,
T4 motion detectors, and looming/object visual projection neurons (LC4, LC6,
LC10a, LC11, LC16). Synapse polarity follows consensus transmitters
(acetylcholine +, GABA/glutamate −).

Rebuild from the public release:

```
python3 scripts/extract-malecns.py
```

Source: [male-cns.janelia.org/download](https://male-cns.janelia.org/download/)
Paper: Berg et al., Cell 2026, doi:10.1016/j.cell.2026.08.015

The lower-right orb is live firing on that graph — visual, descending, and motor
cells lighting as they spike.
