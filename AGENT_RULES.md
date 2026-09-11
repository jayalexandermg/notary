## Evidence Standard

A task, phase, or step is not "complete" until it is verified.
A summary of intent is not verification.

Before reporting anything as complete:

- State each claim as its own line, not folded into a paragraph.
- Each line gets a result (PASS/FAIL/NOT VERIFIED) and the file,
  line number, or test name that proves it.
- If something cannot be verified against actual code or a real
  run, say "NOT VERIFIED." Do not omit it. Do not round it up.
- Measured claims (timing, counts, sizes) get the actual numbers,
  not a qualitative restatement.
- If a result carries a real caveat or boundary — passes for one
  code path but not another, tested by inspection rather than by
  an automated test — state the caveat. A PASS with an undisclosed
  limitation is a false PASS.

This is the floor for every task, regardless of RED/YELLOW/GREEN
classification. RED-tier work requires this evidence PLUS
independent cross-model verification per the standing protocol;
it does not replace this standard, it adds to it.

Record completions with this evidence in the project's own
status/decisions artifacts. Do not treat a completion claim as
fact until the evidence is attached.
