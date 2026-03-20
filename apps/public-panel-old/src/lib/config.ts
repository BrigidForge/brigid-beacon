type ConfiguredVault = {
  address: string;
  label: string;
  note: string;
};

function rawConfiguredVaults(): string {
  const env =
    typeof import.meta !== 'undefined' &&
    typeof import.meta.env === 'object' &&
    import.meta.env &&
    'VITE_PUBLIC_VAULTS' in import.meta.env
      ? import.meta.env.VITE_PUBLIC_VAULTS
      : '';

  return typeof env === 'string' ? env : '';
}

export function getConfiguredVaults(): ConfiguredVault[] {
  return rawConfiguredVaults()
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [address = '', label = '', note = ''] = entry.split('|').map((part) => part.trim());
      return {
        address,
        label: label || 'Configured vault',
        note: note || 'Visitor monitoring route.',
      };
    })
    .filter((vault) => vault.address.startsWith('0x'));
}
