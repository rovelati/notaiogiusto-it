-- Ripara descrizioni UTF-8 che alcune fonti hanno dichiarato/decodificato come Latin-1.
update notai.notaries
set description = replace(
    replace(
      replace(
      replace(
        replace(
          replace(
            replace(
              replace(
                replace(
                  replace(
                    replace(description, 'â' || chr(128) || chr(153), '’'),
                    'Ã' || chr(160), 'à'
                  ),
                  'Ã' || chr(168), 'è'
                ),
                'Ã' || chr(169), 'é'
              ),
              'Ã' || chr(172), 'ì'
            ),
            'Ã' || chr(178), 'ò'
          ),
          'Ã' || chr(185), 'ù'
        ),
        'Ã' || chr(128), 'À'
      ),
        'Â', ''
      ),
      'Ã ', 'à '
    ),
    'Ã' || chr(136), 'È'
  ),
    updated_at = now()
where description ~ '(Ã|Â|â)';
