/** Remove extra self-addresses from Reply All without dropping its primary target. */
export function replyAllRecipients(
  to: string[],
  cc: string[],
  ownAddresses: string[],
): { to: string[]; cc: string[] } {
  const own = new Set(ownAddresses.map((address) => address.toLowerCase()));
  return {
    to: to.filter((address, index) => index === 0 || !own.has(address.toLowerCase())),
    cc: cc.filter((address) => !own.has(address.toLowerCase())),
  };
}
