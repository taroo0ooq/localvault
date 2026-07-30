class VaultItem {
  VaultItem({
    required this.id,
    required this.title,
    required this.url,
    required this.username,
    required this.password,
    this.notes,
  });

  final String id;
  final String title;
  final String url;
  final String username;
  final String password;
  final String? notes;

  Map<String, dynamic> toJson() => {
        'title': title,
        'url': url,
        'username': username,
        'password': password,
        if (notes != null) 'notes': notes,
      };

  factory VaultItem.fromPlain(String id, Map<String, dynamic> j) => VaultItem(
        id: id,
        title: (j['title'] as String?) ?? '',
        url: (j['url'] as String?) ?? '',
        username: (j['username'] as String?) ?? '',
        password: (j['password'] as String?) ?? '',
        notes: j['notes'] as String?,
      );
}
