// Simple test runner for SFWU protocol verification
// Run with: npx ts-node --esm src/test-runner.ts

import { runAllTests } from './sfwu/tests.js';

console.log('╔════════════════════════════════════════════╗');
console.log('║     SFWU Protocol Verification Tests       ║');
console.log('╚════════════════════════════════════════════╝\n');

const { passed, failed, results } = runAllTests();

results.forEach(r => console.log(r));

console.log('\n' + '─'.repeat(44));
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
    console.log('\n✅ All tests passed! Protocol implementation is correct.');
    process.exit(0);
} else {
    console.log('\n❌ Some tests failed. Review implementation.');
    process.exit(1);
}
